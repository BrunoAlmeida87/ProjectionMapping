#!/usr/bin/env python3
"""Synthesizes the Christmas soundtracks of the LuzMap content library.

The melodies are public domain (Jingle Bells, J. L. Pierpont 1857; Stille
Nacht / Noite Feliz, F. X. Gruber 1818; We Wish You a Merry Christmas,
traditional). The arrangements and every sound are generated here with
additive synthesis — no samples or recordings are used.

Usage: python3 tools/make-christmas-music.py   (needs numpy + ffmpeg)
Writes assets/natal/musicas/*.mp3
"""
import os
import subprocess
import wave

import numpy as np

SR = 44100
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'natal', 'musicas')
rng = np.random.default_rng(1225)

NOTE = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def midi(name):
    """'C4', 'F#5', 'Bb3' -> MIDI number."""
    n = NOTE[name[0]]
    rest = name[1:]
    if rest.startswith('#'):
        n += 1
        rest = rest[1:]
    elif rest.startswith('b'):
        n -= 1
        rest = rest[1:]
    return 12 * (int(rest) + 1) + n


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


class Track:
    def __init__(self, seconds):
        self.buf = np.zeros((int(seconds * SR) + SR * 4, 2))

    def add(self, t, sig, pan=0.0, gain=1.0):
        i = int(t * SR)
        n = min(len(sig), len(self.buf) - i)
        if n <= 0:
            return
        l = np.cos((pan + 1) * np.pi / 4)
        r = np.sin((pan + 1) * np.pi / 4)
        self.buf[i:i + n, 0] += sig[:n] * l * gain
        self.buf[i:i + n, 1] += sig[:n] * r * gain


def partials(freq, dur, ratios, amps, decays, attack=0.004, detune=0.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for k, (ra, am, de) in enumerate(zip(ratios, amps, decays)):
        f = freq * ra * (1 + detune * (k % 2 * 2 - 1))
        if f > SR / 2.2:
            continue
        out += am * np.sin(2 * np.pi * f * t + rng.uniform(0, 6.28)) * np.exp(-de * t)
    env = np.minimum(1.0, t / attack)
    rel = int(0.02 * SR)
    env[-rel:] *= np.linspace(1, 0, rel)
    return out * env


def glock(freq, dur=1.6):
    return partials(freq, dur, [1, 2.76, 5.40, 8.93], [1, 0.42, 0.18, 0.06], [2.0, 5.5, 9.0, 14.0], attack=0.002)


def musicbox(freq, dur=2.2):
    s = partials(freq, dur, [1, 2.0, 3.0, 4.07, 6.1], [1, 0.32, 0.12, 0.08, 0.03], [1.6, 3.2, 5.0, 7.0, 9.0], attack=0.0015)
    click = rng.normal(0, 1, int(0.004 * SR)) * np.exp(-np.arange(int(0.004 * SR)) / 40)
    s[: len(click)] += click * 0.08
    return s


def epiano(freq, dur=0.9):
    return partials(freq, dur, [1, 2, 3, 4], [1, 0.3, 0.1, 0.05], [3.0, 6.0, 9.0, 12.0], attack=0.006, detune=0.0015)


def bass(freq, dur=0.7):
    return partials(freq, dur, [1, 2, 3], [1, 0.25, 0.08], [3.5, 6.0, 9.0], attack=0.008)


def sleigh(dur=0.18, strength=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = rng.normal(0, 1, n)
    noise = np.diff(noise, prepend=0)  # crude high-pass
    jingles = sum(np.sin(2 * np.pi * f * t + rng.uniform(0, 6)) for f in rng.uniform(4800, 9000, 6))
    env = np.exp(-t * 26) * np.minimum(1, t / 0.002)
    shimmer = 0.6 + 0.4 * np.sin(2 * np.pi * 38 * t)
    return (noise * 0.35 + jingles * 0.18) * env * shimmer * strength


def chime(freq, dur=3.5):
    return partials(freq, dur, [1, 2.0, 2.76, 4.07, 5.4], [1, 0.5, 0.35, 0.2, 0.1], [0.9, 1.4, 2.2, 3.0, 4.0], attack=0.002)


CHORDS = {
    'C': ['C', 'E', 'G'],
    'F': ['F', 'A', 'C'],
    'G': ['G', 'B', 'D'],
    'G7': ['G', 'B', 'F'],
    'D7': ['D', 'F#', 'C'],
    'Am': ['A', 'C', 'E'],
    'Dm': ['D', 'F', 'A'],
}


def chord_notes(name, octave):
    return [midi(n + str(octave)) for n in CHORDS[name]]


def reverb(x, seconds=1.8, wet=0.22):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    out = np.zeros_like(x)
    for ch in range(2):
        ir = rng.normal(0, 1, n) * np.exp(-t * 6.9 / seconds)
        ir[: int(0.012 * SR)] = 0
        ir /= np.sqrt(np.sum(ir ** 2))
        size = 1 << int(np.ceil(np.log2(len(x) + n)))
        y = np.fft.irfft(np.fft.rfft(x[:, ch], size) * np.fft.rfft(ir, size), size)[: len(x)]
        out[:, ch] = y
    return x * (1 - wet) + out * wet * 1.2


def finish(track, name, tail=3.0):
    x = track.buf
    last = np.max(np.nonzero(np.max(np.abs(x), axis=1) > 1e-4)[0])
    x = x[: min(len(x), last + int(tail * SR))]
    x = reverb(x)
    fade = int(1.2 * SR)
    x[-fade:] *= np.linspace(1, 0, fade)[:, None]
    x /= np.max(np.abs(x)) / 0.89
    pcm = (x * 32767).astype(np.int16)
    wav = os.path.join(OUT, name + '.wav')
    with wave.open(wav, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    mp3 = os.path.join(OUT, name + '.mp3')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '112k',
                    '-metadata', f'title={name}', '-metadata', 'artist=LuzMap (arranjo sintetizado)',
                    '-metadata', 'comment=Melodia em domínio público', mp3], check=True)
    os.remove(wav)
    print(f'{name}.mp3  {len(x) / SR:.1f} s  {os.path.getsize(mp3) / 1024:.0f} KB')


def play_melody(tr, start, beat, notes, voice, octave_shift=12, gain=0.55, pan=0.0):
    t = start
    for n, d in notes:
        if n != 'r':
            tr.add(t, voice(hz(midi(n) + octave_shift)), pan=pan, gain=gain)
        t += d * beat
    return t


# ---------------------------------------------------------------- Jingle Bells
def jingle_bells():
    beat = 60 / 138
    verse = [
        ('G4', 1), ('E5', 1), ('D5', 1), ('C5', 1), ('G4', 3), ('G4', .5), ('G4', .5),
        ('G4', 1), ('E5', 1), ('D5', 1), ('C5', 1), ('A4', 4),
        ('A4', 1), ('F5', 1), ('E5', 1), ('D5', 1), ('B4', 4),
        ('G5', 1), ('G5', 1), ('F5', 1), ('D5', 1), ('E5', 4),
        ('G4', 1), ('E5', 1), ('D5', 1), ('C5', 1), ('G4', 4),
        ('G4', 1), ('E5', 1), ('D5', 1), ('C5', 1), ('A4', 3), ('A4', 1),
        ('A4', 1), ('F5', 1), ('E5', 1), ('D5', 1), ('G5', 1), ('G5', 1), ('G5', 1), ('G5', 1),
        ('A5', 1), ('G5', 1), ('F5', 1), ('D5', 1), ('C5', 2), ('G5', 2),
    ]
    chorus = [
        ('E5', 1), ('E5', 1), ('E5', 2), ('E5', 1), ('E5', 1), ('E5', 2),
        ('E5', 1), ('G5', 1), ('C5', 1.5), ('D5', .5), ('E5', 4),
        ('F5', 1), ('F5', 1), ('F5', 1.5), ('F5', .5), ('F5', 1), ('E5', 1), ('E5', 1), ('E5', .5), ('E5', .5),
        ('E5', 1), ('D5', 1), ('D5', 1), ('E5', 1), ('D5', 2), ('G5', 2),
        ('E5', 1), ('E5', 1), ('E5', 2), ('E5', 1), ('E5', 1), ('E5', 2),
        ('E5', 1), ('G5', 1), ('C5', 1.5), ('D5', .5), ('E5', 4),
        ('F5', 1), ('F5', 1), ('F5', 1), ('F5', 1), ('F5', 1), ('E5', 1), ('E5', 1), ('E5', .5), ('E5', .5),
        ('G5', 1), ('G5', 1), ('F5', 1), ('D5', 1), ('C5', 4),
    ]
    v_ch = ['C', 'C', 'C', 'F', 'F', 'G', 'G', 'C', 'C', 'C', 'C', 'F', 'F', 'G', 'G', 'C']
    c_ch = ['C', 'C', 'C', 'C', 'F', 'C', 'D7', 'G', 'C', 'C', 'C', 'C', 'F', 'C', 'G7', 'C']
    intro = 4
    total_bars = intro + 16 + 16 + 1
    tr = Track(total_bars * 4 * beat + 4)
    # intro: sleigh bells and a rising chime
    for k, n in enumerate(['G4', 'C5', 'E5', 'G5']):
        tr.add(k * beat, chime(hz(midi(n) + 12), 2.5), pan=0.2, gain=0.22)
    t0 = intro * 4 * beat
    play_melody(tr, t0, beat, verse, glock, gain=0.5)
    play_melody(tr, t0 + 16 * 4 * beat, beat, chorus, glock, gain=0.55)
    # doubled melody an octave lower (soft) on the chorus
    play_melody(tr, t0 + 16 * 4 * beat, beat, chorus, epiano, octave_shift=-12, gain=0.16, pan=-0.2)
    chords = v_ch + c_ch
    for b, name in enumerate(chords):
        tb = t0 + b * 4 * beat
        root = chord_notes(name, 2)[0]
        fifth = chord_notes(name, 2)[2]
        tr.add(tb, bass(hz(root)), pan=-0.1, gain=0.5)
        tr.add(tb + 2 * beat, bass(hz(fifth if fifth > root else fifth + 12)), pan=-0.1, gain=0.42)
        for off in (1, 3):
            for m in chord_notes(name, 4):
                tr.add(tb + off * beat, epiano(hz(m), 0.5), pan=-0.35, gain=0.1)
    # sleigh bells on every eighth (accent on beats 2 and 4), also in the intro
    end_beats = total_bars * 4 - 4
    for e in range(int(end_beats * 2)):
        beat_pos = e / 2
        acc = 1.0 if beat_pos % 2 == 1 else (0.55 if e % 2 == 0 else 0.35)
        tr.add(e * beat / 2, sleigh(0.2, acc), pan=0.45, gain=0.32)
    # final chord
    tend = t0 + 32 * 4 * beat
    for m in chord_notes('C', 4) + [midi('C5')]:
        tr.add(tend, chime(hz(m + 12), 3.5), pan=0.1, gain=0.16)
    tr.add(tend, bass(hz(midi('C2')), 2.5), gain=0.5)
    tr.add(tend, sleigh(0.5, 1.2), pan=0.45, gain=0.35)
    finish(tr, 'jingle-bells')


# ---------------------------------------------------------------- Noite Feliz
def noite_feliz():
    e8 = 0.29  # one eighth note (6/8 bar = 6 eighths)
    mel = [
        ('G4', 1.5), ('A4', .5), ('G4', 1), ('E4', 3),
        ('G4', 1.5), ('A4', .5), ('G4', 1), ('E4', 3),
        ('D5', 2), ('D5', 1), ('B4', 3),
        ('C5', 2), ('C5', 1), ('G4', 3),
        ('A4', 2), ('A4', 1), ('C5', 1.5), ('B4', .5), ('A4', 1),
        ('G4', 1.5), ('A4', .5), ('G4', 1), ('E4', 3),
        ('A4', 2), ('A4', 1), ('C5', 1.5), ('B4', .5), ('A4', 1),
        ('G4', 1.5), ('A4', .5), ('G4', 1), ('E4', 3),
        ('D5', 2), ('D5', 1), ('F5', 1.5), ('D5', .5), ('B4', 1),
        ('C5', 3), ('E5', 3),
        ('C5', 1.5), ('G4', .5), ('E4', 1), ('G4', 1.5), ('F4', .5), ('D4', 1),
        ('C4', 6),
    ]
    chords = ['C', 'C', 'G', 'C', 'F', 'C', 'F', 'C', 'G', 'C', ['C', 'G7'], 'C']
    intro = 2
    tr = Track((intro + 12 * 2) * 6 * e8 + 6)
    t0 = intro * 6 * e8
    # intro: arpeggio on C
    for k, n in enumerate(['C4', 'E4', 'G4', 'C5', 'G4', 'E4', 'C4', 'E4', 'G4', 'C5', 'E5', 'G5']):
        tr.add(k * e8, musicbox(hz(midi(n) + 12), 1.8), pan=0.15, gain=0.22)
    for rep in range(2):
        start = t0 + rep * 12 * 6 * e8
        shift = 12 if rep == 0 else 24
        play_melody(tr, start, e8, mel, musicbox, octave_shift=shift, gain=0.6, pan=0.05)
        if rep == 1:
            play_melody(tr, start, e8, mel, chime, octave_shift=0, gain=0.12, pan=-0.25)
        for b, ch in enumerate(chords):
            parts = ch if isinstance(ch, list) else [ch, ch]
            for half, name in enumerate(parts):
                tb = start + b * 6 * e8 + half * 3 * e8
                notes = chord_notes(name, 3)
                tr.add(tb, bass(hz(notes[0] - 12), 1.6), gain=0.32)
                for k, m in enumerate([notes[0], notes[1], notes[2]]):
                    tr.add(tb + k * e8, musicbox(hz(m + 12), 1.4), pan=-0.3, gain=0.17)
    tend = t0 + 24 * 6 * e8
    for m in chord_notes('C', 4):
        tr.add(tend, chime(hz(m + 12), 4.0), gain=0.16)
    finish(tr, 'noite-feliz', tail=4.0)


# ------------------------------------------------- We Wish You a Merry Christmas
def we_wish():
    beat = 60 / 160
    a = [
        ('C5', 1), ('C5', .5), ('D5', .5), ('C5', .5), ('B4', .5),
        ('A4', 1), ('A4', 1), ('A4', 1),
        ('D5', 1), ('D5', .5), ('E5', .5), ('D5', .5), ('C5', .5),
        ('B4', 1), ('G4', 1), ('G4', 1),
        ('E5', 1), ('E5', .5), ('F5', .5), ('E5', .5), ('D5', .5),
        ('C5', 1), ('A4', 1), ('G4', .5), ('G4', .5),
        ('A4', 1), ('D5', 1), ('B4', 1),
        ('C5', 2), ('G4', 1),
    ]
    b = [
        ('C5', 1), ('C5', 1), ('C5', 1),
        ('B4', 2), ('B4', 1),
        ('C5', 1), ('B4', 1), ('A4', 1),
        ('G4', 2), ('D5', 1),
        ('E5', 1), ('D5', 1), ('C5', 1),
        ('G5', 1), ('G4', 1), ('G4', .5), ('G4', .5),
        ('A4', 1), ('D5', 1), ('B4', 1),
        ('C5', 3),
    ]
    ch_a = ['C', 'F', 'G', 'G', 'C', 'F', 'G', 'C']
    ch_b = ['C', 'G', 'Am', 'G', 'C', 'C', 'G7', 'C']
    form = [(a, ch_a), (b, ch_b), (a, ch_a), (b, ch_b)]
    bars = sum(len(c) for _, c in form)
    tr = Track((bars + 2) * 3 * beat + 6)
    t = 2 * 3 * beat
    for k in range(5):
        tr.add(k * 1.2 * beat, sleigh(0.3, 0.8), pan=0.45, gain=0.3)
    tr.add(t - beat, glock(hz(midi('G4') + 12)), gain=0.5)  # pickup
    for i, (mel, chs) in enumerate(form):
        mel_t = t
        # last section ends early so the pickup of the next section fits
        play_melody(tr, mel_t, beat, mel, glock, gain=0.5 if i < 2 else 0.56)
        if i >= 2:
            play_melody(tr, mel_t, beat, mel, epiano, octave_shift=0, gain=0.14, pan=-0.2)
        for bi, name in enumerate(chs):
            tb = t + bi * 3 * beat
            notes = chord_notes(name, 3)
            tr.add(tb, bass(hz(notes[0] - 12), 0.8), gain=0.48)
            for off in (1, 2):
                for m in chord_notes(name, 4):
                    tr.add(tb + off * beat, epiano(hz(m), 0.4), pan=-0.35, gain=0.09)
            for e in range(6):
                tr.add(tb + e * beat / 2, sleigh(0.14, 0.9 if e == 0 else 0.45), pan=0.45, gain=0.22)
        t += len(chs) * 3 * beat
    for m in chord_notes('C', 4) + [midi('C5')]:
        tr.add(t, chime(hz(m + 12), 3.5), gain=0.15)
    tr.add(t, bass(hz(midi('C2')), 2.5), gain=0.5)
    finish(tr, 'we-wish')


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    jingle_bells()
    noite_feliz()
    we_wish()

#!/usr/bin/env python3
"""Exercise the real Pi TUI in a disposable PTY; no model requests are sent."""
import fcntl
import json
import os
import pathlib
import pty
import select
import signal
import struct
import subprocess
import tempfile
import termios
import time

root = pathlib.Path(__file__).resolve().parent.parent
with tempfile.TemporaryDirectory(prefix='pi-style-tui-') as temporary:
    agent = pathlib.Path(temporary)
    env = dict(os.environ, PI_CODING_AGENT_DIR=str(agent), TERM='xterm-256color', COLORTERM='truecolor')
    subprocess.run(['node', '--input-type=module', '-e',
                    'const {applyPreset}=await import(process.argv[1]); applyPreset(process.env.PI_CODING_AGENT_DIR,process.argv[2]);',
                    (root / 'scripts/setup.mjs').as_uri(), str(root)], env=env, check=True, timeout=15)
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 40, 110, 0, 0))
    process = subprocess.Popen(['pi', '--no-session'], cwd=temporary, env=env, stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
    os.close(slave)
    output = bytearray()
    checks = {'warm_accent': b'38;2;215;119;87', 'comfy_background': b'48;2;44;50;62', 'footer': b'Thinking:'}
    try:
        deadline = time.monotonic() + 25
        while time.monotonic() < deadline and process.poll() is None:
            if select.select([master], [], [], 0.2)[0]:
                try: output.extend(os.read(master, 65536))
                except OSError: break
            if all(marker in output for marker in checks.values()):
                break
        assert all(marker in output for marker in checks.values()), 'Missing UI layers: ' + ', '.join(k for k, v in checks.items() if v not in output)
        assert b'detected another custom editor' not in output, 'Competing editor detected'
        assert b'Failed to load extension' not in output, 'Extension import failed'
        os.write(master, b'/quit\r')
        deadline = time.monotonic() + 5
        while process.poll() is None and time.monotonic() < deadline:
            if select.select([master], [], [], 0.1)[0]:
                try: output.extend(os.read(master, 65536))
                except OSError: break
        print('PASS: real Pi TUI rendered warm accent, Comfy input and footer without an editor conflict.')
    finally:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
            try: process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=3)
        os.close(master)

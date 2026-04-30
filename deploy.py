#!/usr/bin/env python3
"""Deploy HikmaProf to production server."""

import os
import sys
import paramiko
import stat
from pathlib import Path

HOST = '10.109.0.50'
USER = 'ztariq'
PASSWORD = '77>5AFRr13gM'
REMOTE_DIR = '/home/ztariq/HikmaProf'
LOCAL_DIR = Path(__file__).parent

EXCLUDE = {
    '__pycache__', '.git', 'output', 'uploads',
    'node_modules', 'deploy.py', '.env'
}
EXCLUDE_EXT = {'.pyc', '.pyo'}


def should_exclude(path: Path) -> bool:
    for part in path.parts:
        if part in EXCLUDE:
            return True
    if path.suffix in EXCLUDE_EXT:
        return True
    return False


def sftp_mkdir_p(sftp, remote_path: str):
    parts = remote_path.split('/')
    current = ''
    for part in parts:
        if not part:
            current = '/'
            continue
        current = current.rstrip('/') + '/' + part
        try:
            sftp.stat(current)
        except FileNotFoundError:
            sftp.mkdir(current)


def upload_dir(sftp, local_base: Path, remote_base: str):
    for item in sorted(local_base.rglob('*')):
        rel = item.relative_to(local_base)
        if should_exclude(rel):
            continue
        remote_path = remote_base + '/' + str(rel).replace(os.sep, '/')
        if item.is_dir():
            try:
                sftp.stat(remote_path)
            except FileNotFoundError:
                print(f'  mkdir {remote_path}')
                sftp.mkdir(remote_path)
        elif item.is_file():
            print(f'  upload {rel}')
            sftp.put(str(item), remote_path)


def run_remote(client: paramiko.SSHClient, cmd: str, desc: str = ''):
    if desc:
        print(f'\n=== {desc} ===')
    print(f'$ {cmd}')
    stdin, stdout, stderr = client.exec_command(cmd, timeout=120)
    out = stdout.read().decode()
    err = stderr.read().decode()
    if out:
        print(out.rstrip())
    if err:
        print('STDERR:', err.rstrip(), file=sys.stderr)
    return stdout.channel.recv_exit_status(), out, err


def main():
    print(f'Connecting to {USER}@{HOST}...')
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=15)
    print('Connected.')

    # Sync files
    print('\n=== Syncing files ===')
    sftp = client.open_sftp()
    try:
        sftp.stat(REMOTE_DIR)
    except FileNotFoundError:
        sftp.mkdir(REMOTE_DIR)
    upload_dir(sftp, LOCAL_DIR, REMOTE_DIR)
    sftp.close()
    print('Files synced.')

    # Install Python dependencies
    run_remote(client,
        f'cd {REMOTE_DIR} && pip3 install -r requirements.txt --quiet 2>&1 | tail -5',
        'Installing Python dependencies')

    # Kill any existing app instance
    run_remote(client,
        "pkill -f 'python3 app.py' || true",
        'Stopping existing app')

    # Start app with nohup
    run_remote(client,
        f'cd {REMOTE_DIR} && nohup python3 app.py --port 9000 > app.log 2>&1 &',
        'Starting HikmaProf on port 9000')

    import time
    time.sleep(3)

    # Verify it's running
    code, out, _ = run_remote(client,
        "pgrep -fa 'python3 app.py' || echo 'NOT RUNNING'",
        'Verifying process')

    # Check app log
    run_remote(client,
        f'tail -20 {REMOTE_DIR}/app.log',
        'App startup log')

    client.close()
    print(f'\nDone. App should be running at http://{HOST}:9000')


if __name__ == '__main__':
    main()

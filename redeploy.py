#!/usr/bin/env python3
"""Sync files to ~/hikmaprof and restart Flask from correct directory."""

import paramiko, time, os
from pathlib import Path

HOST = '10.109.0.50'
USER = 'ztariq'
PASSWORD = '77>5AFRr13gM'
REMOTE_DIR = '/home/ztariq/hikmaprof'
LOCAL_DIR = Path(__file__).parent

EXCLUDE = {'__pycache__', '.git', 'output', 'uploads', 'node_modules',
           'redeploy.py', 'deploy.py', 'deploy_nginx.py', 'configure_nginx.py',
           'configure_nginx2.py', 'check_prod.py', 'check_server.py',
           'check_deploy.py', 'fix_all.py', 'nginx_hikmaprof.conf'}
EXCLUDE_EXT = {'.pyc', '.pyo'}


def should_exclude(path: Path) -> bool:
    for part in path.parts:
        if part in EXCLUDE:
            return True
    return path.suffix in EXCLUDE_EXT


def run(client, cmd, timeout=15):
    print(f'$ {cmd}')
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode()
    err = stderr.read().decode()
    if out: print(out.rstrip())
    if err: print('ERR:', err.rstrip())
    return out


def main():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=15)
    print(f'Connected. Syncing to {REMOTE_DIR}\n')

    sftp = client.open_sftp()

    def sftp_makedirs(path):
        parts = path.replace('/home/ztariq/', '').split('/')
        current = '/home/ztariq'
        for part in parts:
            current += '/' + part
            try:
                sftp.stat(current)
            except FileNotFoundError:
                sftp.mkdir(current)

    for item in sorted(LOCAL_DIR.rglob('*')):
        rel = item.relative_to(LOCAL_DIR)
        if should_exclude(rel):
            continue
        remote_path = REMOTE_DIR + '/' + str(rel).replace(os.sep, '/')
        if item.is_dir():
            try:
                sftp.stat(remote_path)
            except FileNotFoundError:
                print(f'  mkdir {rel}')
                sftp.mkdir(remote_path)
        elif item.is_file():
            print(f'  {rel}')
            sftp.put(str(item), remote_path)

    sftp.close()
    print('\nFiles synced.')

    # Kill old Flask processes
    print('\n=== Restarting Flask from ~/hikmaprof ===')
    run(client, "pkill -f 'python3 app.py' || true")
    time.sleep(1)

    # Start from the correct directory
    _, stdout, _ = client.exec_command(
        f'cd {REMOTE_DIR} && nohup python3 app.py --port 9000 > {REMOTE_DIR}/app.log 2>&1 &',
        timeout=5)
    time.sleep(4)

    run(client, "pgrep -fa 'python3 app.py' || echo 'NOT RUNNING'")
    run(client, f'tail -15 {REMOTE_DIR}/app.log')
    run(client, 'ss -tlnp | grep 9000 || echo "Port 9000 not listening"')

    client.close()
    print('\nDone. Visit: https://hikma.hbku.edu.qa/HikmaProf/')


if __name__ == '__main__':
    main()

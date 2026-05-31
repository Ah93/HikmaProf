#!/usr/bin/env python3
"""Check and fix deployment on production server."""

import paramiko
import sys
import time

HOST = '10.109.0.50'
USER = 'ztariq'
PASSWORD = '77>5AFRr13gM'
REMOTE_DIR = '/home/ztariq/HikmaProf'


def run(client, cmd, timeout=30):
    print(f'$ {cmd}')
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    try:
        out = stdout.read().decode()
        err = stderr.read().decode()
    except Exception as e:
        out, err = '', str(e)
    if out:
        print(out.rstrip())
    if err and 'not found' not in err.lower():
        print('ERR:', err.rstrip())
    return out


def main():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=15)
    print('Connected.\n')

    # Check if already running
    out = run(client, "pgrep -fa 'python3 app.py'")
    if 'app.py' in out:
        print('\nApp is already running!')
    else:
        print('\nApp not running. Starting it...')
        # Use a detached approach via bash -c
        run(client,
            f"cd {REMOTE_DIR} && bash -c 'nohup python3 app.py --port 9000 > app.log 2>&1 & echo $!'",
            timeout=10)
        time.sleep(4)
        out = run(client, "pgrep -fa 'python3 app.py'")
        if 'app.py' in out:
            print('App started successfully!')
        else:
            print('Starting with PATH fix...')
            run(client,
                f"cd {REMOTE_DIR} && export PATH=$PATH:/home/ztariq/.local/bin && "
                f"bash -c 'nohup python3 app.py --port 9000 > app.log 2>&1 & echo started'",
                timeout=10)
            time.sleep(4)

    print('\n--- App log (last 30 lines) ---')
    run(client, f'tail -30 {REMOTE_DIR}/app.log')

    print('\n--- Port check ---')
    run(client, 'ss -tlnp | grep 9000 || echo "Port 9000 not listening"')

    client.close()
    print(f'\nCheck: http://{HOST}:9000')


if __name__ == '__main__':
    main()

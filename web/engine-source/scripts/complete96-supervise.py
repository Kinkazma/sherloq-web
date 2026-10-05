import json, os, signal, subprocess, sys, shlex, time
from pathlib import Path
from datetime import datetime, timezone

def owned_browser_processes(rows, directory):
    directory=Path(directory).resolve()
    owned=set()
    for pid,ppid,command in rows:
        try: args=shlex.split(command)
        except ValueError: continue
        for arg in args:
            if arg.startswith('--user-data-dir='):
                profile=Path(arg.split('=',1)[1]).resolve()
                if profile.parent==directory and profile.name.startswith('chrome-'):
                    owned.add(pid)
    while True:
        expanded=owned|{pid for pid,ppid,_ in rows if ppid in owned}
        if expanded==owned: break
        owned=expanded
    return {pid:command for pid,_,command in rows if pid in owned}

def process_rows():
    return [(int(pid),int(ppid),command) for pid,ppid,command in (line.split(None,2) for line in subprocess.check_output(['ps','-Ao','pid=,ppid=,args='],text=True).splitlines())]

def close_orphan_browsers(directory):
    # Only this run's unique profile and descendants qualify; unrelated Chrome
    # sessions must survive even when the runner dies outside its own finally.
    owned=owned_browser_processes(process_rows(),directory)
    for pid in owned:
        try: os.kill(pid,signal.SIGTERM)
        except ProcessLookupError: pass
    if owned:
        time.sleep(1)
        live={pid:command for pid,_,command in process_rows()}
        for pid,command in owned.items():
            if live.get(pid)==command:
                try: os.kill(pid,signal.SIGKILL)
                except ProcessLookupError: pass
    return list(owned)

def main():
    if len(sys.argv)!=2: raise SystemExit('Usage: python3 scripts/complete96-supervise.py RUN_DIRECTORY')
    run=Path(sys.argv[1]).resolve()
    runner=Path(__file__).resolve().with_name('complete96-runner.mjs')
    node='/opt/homebrew/Cellar/node@22/22.22.2_2/bin/node'
    def now(): return datetime.now(timezone.utc).isoformat()
    def save(name,value):
        target=run/name
        temp=run/(name+'.supervisor-tmp')
        temp.write_text(json.dumps(value,indent=2)+'\n')
        temp.replace(target)

    with (run/'console.log').open('ab',buffering=0) as log:
        child=subprocess.Popen([node,str(runner),str(run)],cwd=run,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
        keepawake=subprocess.Popen(['/usr/bin/caffeinate','-i','-w',str(child.pid)],stdin=subprocess.DEVNULL,stdout=log,stderr=log)
        job={'supervisorPid':os.getpid(),'runnerPid':child.pid,'caffeinatePid':keepawake.pid,'startedAt':now(),'timeoutSeconds':24*3600,'directory':str(run)}
        save('job.json',job)
        timed_out=False
        try:
            code=child.wait(timeout=24*3600)
        except subprocess.TimeoutExpired:
            timed_out=True
            # Capture only descendants of this job before shutdown; Chrome can have its own process group.
            rows=[line.split(None,2) for line in subprocess.check_output(['ps','-Ao','pid=,ppid=,command='],text=True).splitlines()]
            descendants={child.pid}
            for _ in range(12):
                expanded=descendants|{int(r[0]) for r in rows if len(r)>=2 and int(r[1]) in descendants}
                if expanded==descendants: break
                descendants=expanded
            child.send_signal(signal.SIGTERM)
            try: code=child.wait(timeout=30)
            except subprocess.TimeoutExpired:
                for pid in sorted(descendants,reverse=True):
                    try: os.kill(pid,signal.SIGTERM)
                    except ProcessLookupError: pass
                try: code=child.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    for pid in sorted(descendants,reverse=True):
                        try: os.kill(pid,signal.SIGKILL)
                        except ProcessLookupError: pass
                    code=child.wait()
        finally:
            if keepawake.poll() is None: keepawake.terminate()
            keepawake.wait()
        cleanup=[]
        if code!=0 or timed_out:
            try: cleanup=close_orphan_browsers(run)
            except Exception as error: job['orphanCleanupError']=str(error)
        job.update(exitCode=code,timedOut=timed_out,stoppedAt=now(),orphanBrowserPids=cleanup)
        save('job.json',job)
        try: status=json.loads((run/'status.json').read_text())
        except (FileNotFoundError,json.JSONDecodeError): status={}
        if timed_out or status.get('state') not in ('completed','failed','interrupted'):
            status.update(state='timeout' if timed_out else 'failed',phase='stopped',exitCode=code,stoppedAt=now(),error=status.get('error',{'message':'Runner exited before writing a final result'}))
            save('status.json',status)

if __name__=='__main__': main()

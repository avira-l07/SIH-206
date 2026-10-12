import {useCallback,useEffect,useRef,useState} from 'react';
import api from '../services/api';
import {useSocket} from '../context/SocketContext';
export default function useFieldResource(paths) {
  const [data,setData]=useState({}),[error,setError]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const {socket}=useSocket(),version=useRef(0),key=JSON.stringify(paths);
  const load=useCallback(async()=>{
    const request=++version.current;setLoading(true);
    const results=await Promise.allSettled(JSON.parse(key).map(([name,path])=>api.get(path).then(r=>[name,r.data])));
    if(request!==version.current)return;
    setData(previous=>({...previous,...Object.fromEntries(results.filter(r=>r.status==='fulfilled').map(r=>r.value))}));
    setError(results.some(r=>r.status==='rejected')?'Some data could not refresh. Last loaded data is retained.':'');setLoading(false);
  },[key]);
  useEffect(()=>{
    const generation=version;let timer;
    const schedule=()=>{version.current++;clearTimeout(timer);timer=setTimeout(load,300);};
    load();socket?.on('operations:changed',schedule);socket?.on('connect',schedule);window.addEventListener('online',schedule);
    const poll=setInterval(schedule,60000);
    return()=>{generation.current++;clearTimeout(timer);clearInterval(poll);socket?.off('operations:changed',schedule);socket?.off('connect',schedule);window.removeEventListener('online',schedule);};
  },[load,socket]);
  const act=async(method,path,body,success)=>{
    setBusy(true);setError('');setMessage('');
    try{const result=await api[method](path,body);setMessage(success||result.data.message||'Saved');await load();return result.data;}
    catch(err){setError(err.response?.data?.error||'Update failed. Check your connection and retry.');return null;}
    finally{setBusy(false);}
  };
  return {data,error,loading,busy,message,act,load};
}

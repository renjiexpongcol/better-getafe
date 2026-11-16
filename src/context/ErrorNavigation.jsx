import {createContext,useContext,useEffect,useRef} from 'react'
import {useLocation} from 'react-router-dom'
import {isSafeErrorDestination} from '../services/errorNavigation'
const Context=createContext(null)
export function ErrorNavigationProvider({children}) {
 const location=useLocation(), record=useRef({current:null,previous:null,failed:new Set()})
 const key=location.key
 if(record.current.current?.key !== key) {
  const old=record.current.current
  if(old && !record.current.failed.has(old.key) && document.querySelector('main') && !document.querySelector('.route-status-page,.page-loader,.route-loader,.configuration-loader')) old.successful=true
  if(old?.successful && !record.current.failed.has(old.key)) record.current.previous=old
  record.current.current={key,pathname:location.pathname,successful:false}
 }
 useEffect(()=>{
  const current=record.current.current
  const check=()=>{
   if(current.key!==record.current.current.key)return
   if(document.querySelector('.route-status-page')) {current.successful=false;record.current.failed.add(current.key);observer.disconnect();return}
   // Only established public destinations are recorded automatically. Private
   // pages record completion after their authorization boundary has resolved.
   const ready=!document.querySelector('.page-loader,.route-loader,.configuration-loader') && document.querySelector('main')
   if(ready && !record.current.failed.has(current.key)) {current.successful=true;observer.disconnect()}
  }
  let scheduled=false
  const observer=new MutationObserver(()=>{if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;check()})});observer.observe(document.getElementById('root'),{subtree:true,childList:true});check()
  return ()=>observer.disconnect()
 },[key])
 return <Context.Provider value={record}>{children}</Context.Provider>
}
export function useErrorHistory() {
 const record=useContext(Context), location=useLocation()
 useEffect(()=>{if(record){record.current.failed.add(location.key);if(record.current.current?.key===location.key)record.current.current.successful=false}},[record,location.key])

 const previous=record?.current.previous
 // Destination authorization is checked again against the current session by
 // the navigation helper; no browser history or external referrer is trusted.
 return previous && (previous.successful || isSafeErrorDestination(previous.pathname)) ? previous : null
}



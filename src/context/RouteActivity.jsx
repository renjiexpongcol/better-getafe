import {createContext, useContext, useEffect, useState} from 'react'
const Context=createContext(null)
export function RouteActivityProvider({children}) {
  const [errors,setErrors]=useState(0)
  return <Context.Provider value={{errorActive:errors>0,setErrors}}>{children}</Context.Provider>
}
export const useRouteActivity=()=>useContext(Context)
export function useErrorActivity() {
  const activity=useRouteActivity(), setErrors=activity?.setErrors
  useEffect(()=>{setErrors?.(value=>value+1);return ()=>setErrors?.(value=>value-1)},[setErrors])
}

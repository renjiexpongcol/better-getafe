import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

const stamp = '2026-11-19T00:00:00.000Z'
const policy = {id:'policy',name:'Support',permission_id:'help.view',updated_at:stamp}
const proposal = {name:'Updated',description:'',enabled:true,effect:'deny',condition:{},reason:'Review access',expected_updated_at:stamp}
const revision = {id:'revision',author_id:'editor',status:'pending',policy_id:policy.id,base_version:stamp,proposed_value:proposal}
let member, current, events, commands
const db = {
  exec: async command => commands.push(command),
  prepare: sql => ({
    get: async () => sql.includes('FROM auth_policy_proposals') ? revision : sql.includes('FROM auth_policies') ? policy : member,
    run: async () => ({changes: current ? 1 : 0}),
  }),
}
mock.module('../server/src/services/authorizationService.js',{namedExports:{
  effectiveAccessFor:async()=>({permissions:[]}), ensureAuthorizationData:async()=>db, hasAccess:async actor=>actor.id==='manager',
  requireAccess:async(actor,p)=>{if(actor.id!=='manager' && p!=='policies.edit' && !(actor.canReview && p==='policies.manage')) throw Object.assign(new Error('Denied'),{status:403})},
  audit:async(_db,_actor,event)=>events.push(event),
}})
const routes={}
const {installPolicyWorkspace}=await import('../server/src/services/policyWorkspace.js')
installPolicyWorkspace({get(){},put(){},post(path,handler){routes[path.split('/').at(-1)]=handler}},()=>{})
for(const [name,route,actor,body,inScope,unchanged,status,event] of [
  ['editor within delegation','proposals',{id:'editor'},proposal,true,true,200,'POLICY_SUBMITTED'],
  ['missing or expired delegation','proposals',{id:'editor'},proposal,false,true,403],
  ['independent publication','review',{id:'manager'},{decision:'publish'},true,true,200,'POLICY_REVIEWED'],
  ['self approval denied','review',{id:'editor',canReview:true},{decision:'publish'},true,true,403],
  ['concurrent change rejected','review',{id:'manager'},{decision:'publish'},true,false,409],
  ['editor cannot publish','review',{id:'editor'},{decision:'publish'},true,true,403],
]){
  test(name,async()=>{
    member=inScope;current=unchanged;commands=[];events=[]
    const res={code:200,status(n){this.code=n;return this},json(){}}
    await routes[route]({apiAccount:actor,params:{id:policy.id},body},res)
    assert.equal(res.code,status)
    assert.deepEqual(commands,['BEGIN',event?'COMMIT':'ROLLBACK'])
    assert.deepEqual(events,event?[event]:[])
  })
}


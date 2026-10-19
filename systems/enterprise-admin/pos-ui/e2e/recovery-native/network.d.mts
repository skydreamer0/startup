import type { Request, Route } from '@playwright/test';
export interface RecoveryFixture { tenantId:string; userId:string; shiftId:string; productId:string; batchId:string; accessToken:string; nonce:string }
export interface RequestRow { id:string;caseId:string;phase:string;method:string;path:string;dispatched:boolean;cancelled:boolean;delivered:boolean;status?:number;sha256?:string;payload?:{commandId:string;[key:string]:unknown};droppedAfterCommit?:boolean;competingCommit?:boolean }
export interface RecoveryState { fixture:RecoveryFixture;caseId:string;mode:string;phase:string;checkoutSeen:boolean;requests:RequestRow[];errors:string[];pageErrors:string[];verifiedBrand:unknown[];cancelled:WeakSet<Request>;controllers:Map<Request,AbortController>;ending:boolean;refundReady:boolean;refundRelease:Promise<void>;releaseRefund:()=>void }
export function createState(fixture:RecoveryFixture,scenario:{id:string;mode:string}):RecoveryState;
export function endRecovery(state:RecoveryState):void;
export function createPacer(options?:{spacing?:number;now?:()=>number;wait?:(ms:number,value?:unknown,options?:{signal:AbortSignal})=>Promise<unknown>;limit?:number}):(signal:AbortSignal)=>Promise<boolean>;
export function requestClass(request:Request):{kind:string;path?:string;pathname?:string;method?:string;brand?:unknown};
export function createRecoveryDispatch(state:RecoveryState,options?:{pace?:(signal:AbortSignal)=>Promise<boolean>;id?:()=>string}):(route:Route)=>Promise<void>;

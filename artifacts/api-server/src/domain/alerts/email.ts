import { AppConfigError } from "@/lib/env";
import type { EmailMessage, EmailProvider } from "./types";

export class DisabledEmailProvider implements EmailProvider{name="disabled";async send(_message:EmailMessage):Promise<{messageId:string}>{throw new AppConfigError("Email delivery is disabled until an approved provider is explicitly configured.");}}
export class ResendEmailProvider implements EmailProvider{
  name="resend";
  constructor(private readonly fetcher:typeof fetch=fetch){}
  async send(message:EmailMessage){const key=process.env.EMAIL_API_KEY?.trim(),from=process.env.EMAIL_FROM?.trim();if(process.env.PLAYPACKPILOT_EMAIL_ENABLED!=="true"||!key||!from)throw new AppConfigError("Email delivery is not fully configured.");const response=await this.fetcher("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({from,to:[message.to],subject:message.subject,text:message.text,html:message.html,headers:message.headers})});const data=await response.json().catch(()=>({})) as Record<string,unknown>;if(!response.ok)throw new Error(`Email provider rejected delivery with HTTP ${response.status}.`);return{messageId:String(data.id??"unknown")};}
}
export function configuredEmailProvider():EmailProvider{return process.env.EMAIL_PROVIDER==="resend"?new ResendEmailProvider():new DisabledEmailProvider();}

import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { ConfigService } from '@nestjs/config';

interface WebEventPayload {
  tid: string;
  type: string;
  name?: string;
  url?: string;
  referrer?: string;
  ua?: string;
  ip?: string | string[];
  utm?: Record<string, string>;
  meta?: Record<string, unknown>;
  sid?: string;
}

interface EmailEventContext {
  ip?: string | string[];
  ua?: string;
}

@Injectable()
export class TrackingService {
  private apiUrl: string;

  constructor(
    @InjectQueue('tracking') private trackingQueue: Queue,
    private config: ConfigService,
  ) {
    this.apiUrl = this.config.get('API_URL') || 'http://localhost:3005';
  }

  queueWebEvent(payload: WebEventPayload): void {
    this.trackingQueue.add('web-event', payload, {
      removeOnComplete: true,
      removeOnFail: 100,
      attempts: 2,
    });
  }

  queueEmailOpen(trackingId: string, ctx: EmailEventContext): void {
    this.trackingQueue.add('email-open', { trackingId, ...ctx }, {
      removeOnComplete: true,
      removeOnFail: 100,
      attempts: 2,
    });
  }

  queueEmailClick(trackingId: string, ctx: EmailEventContext): void {
    this.trackingQueue.add('email-click', { trackingId, ...ctx }, {
      removeOnComplete: true,
      removeOnFail: 100,
      attempts: 2,
    });
  }

  encodeTrackingId(data: Record<string, string>): string {
    return Buffer.from(JSON.stringify(data)).toString('base64url');
  }

  decodeTrackingId(encoded: string): Record<string, string> | null {
    try {
      return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8'));
    } catch {
      return null;
    }
  }

  buildOpenPixelUrl(emailCampaignId: string, subscriberId: string, projectId: string): string {
    const id = this.encodeTrackingId({ ec: emailCampaignId, s: subscriberId, p: projectId });
    return `${this.apiUrl}/api/t/o/${id}`;
  }

  buildClickUrl(emailCampaignId: string, subscriberId: string, projectId: string, originalUrl: string): string {
    const id = this.encodeTrackingId({ ec: emailCampaignId, s: subscriberId, p: projectId, url: originalUrl });
    return `${this.apiUrl}/api/t/c/${id}`;
  }

  generateSnippet(trackingId: string): string {
    return `<!-- Marketing AI Tracking -->
<script>
(function(w,d){
  var q=w.mktai=w.mktai||function(){(w.mktai.q=w.mktai.q||[]).push(arguments)};
  q.tid='${trackingId}';
  q.ep='${this.apiUrl}/api/t';
  var sid=sessionStorage.getItem('_mktai_sid');
  if(!sid){sid=Math.random().toString(36).substr(2,12);sessionStorage.setItem('_mktai_sid',sid);}
  q.sid=sid;
  var u=new URLSearchParams(location.search),utm={};
  ['source','medium','campaign','content','term'].forEach(function(k){
    var v=u.get('utm_'+k);if(v){utm[k]=v;}
  });
  if(Object.keys(utm).length){
    try{localStorage.setItem('_mktai_utm',JSON.stringify(utm));}catch(e){}
  }else{
    try{var s=localStorage.getItem('_mktai_utm');if(s)utm=JSON.parse(s);}catch(e){}
  }
  q.utm=utm;
  function send(type,name,meta){
    var p={tid:q.tid,type:type,url:location.href,referrer:d.referrer,sid:q.sid};
    if(name)p.name=name;
    if(Object.keys(utm).length)p.utm=utm;
    if(meta)p.meta=meta;
    if(navigator.sendBeacon){
      navigator.sendBeacon(q.ep+'/event',new Blob([JSON.stringify(p)],{type:'application/json'}));
    }else{
      var x=new XMLHttpRequest();x.open('POST',q.ep+'/event');
      x.setRequestHeader('Content-Type','application/json');
      x.send(JSON.stringify(p));
    }
  }
  send('page_view');
  var orig=w.mktai;
  w.mktai=function(cmd,name,meta){
    if(cmd==='event')send('event',name,meta);
    else if(cmd==='conversion')send('conversion',name,meta);
  };
  w.mktai.tid=orig.tid;w.mktai.ep=orig.ep;w.mktai.sid=orig.sid;w.mktai.utm=orig.utm;
  if(orig.q){orig.q.forEach(function(a){w.mktai.apply(null,a);});}
})(window,document);
</` + `script>
<noscript><img src="${this.apiUrl}/api/t/pixel.gif?tid=${trackingId}" alt="" width="1" height="1" style="display:none"/></noscript>
<!-- End Marketing AI Tracking -->`;
  }
}

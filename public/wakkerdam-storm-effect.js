/*
 * Wakkerdam Storm Effect
 * API:
 *   const storm = window.WakkerdamStorm.mount(heroElement, options)
 *   storm.show(); storm.hide(); storm.setOptions({...})
 *   storm.triggerLightning(); await storm.revealWinner(contentElement)
 *   storm.destroy()
 */
(function(){
  'use strict';

  const DEFAULTS={
    density:210,
    speed:660,
    wind:210,
    length:22,
    thickness:1.15,
    brightness:52,
    frequency:38,
    power:68,
    branches:4,
    darkness:52,
    fog:28,
    flashColor:'190,220,255',
    autoLightning:true
  };

  const PRESETS={
    wolf:{density:210,speed:660,wind:210,length:22,thickness:1.15,brightness:52,frequency:38,power:68,branches:4,darkness:52,fog:28,flashColor:'190,220,255',autoLightning:true},
    storm:{density:390,speed:980,wind:365,length:36,thickness:1.75,brightness:78,frequency:82,power:94,branches:8,darkness:42,fog:44,flashColor:'240,245,255',autoLightning:true},
    drizzle:{density:110,speed:350,wind:95,length:13,thickness:.85,brightness:35,frequency:14,power:48,branches:2,darkness:64,fog:67,flashColor:'190,220,255',autoLightning:true},
    reveal:{density:185,speed:590,wind:185,length:19,thickness:1.05,brightness:45,frequency:22,power:78,branches:5,darkness:68,fog:38,flashColor:'190,220,255',autoLightning:true}
  };

  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

  class StormEffect{
    constructor(container,options={}){
      if(!container) throw new Error('WakkerdamStorm: container ontbreekt.');
      this.container=container;
      this.options={...DEFAULTS,...options};
      this.width=1;
      this.height=1;
      this.ratio=1;
      this.drops=[];
      this.lastTime=performance.now();
      this.lightningUntil=0;
      this.lightningSegments=[];
      this.nextLightningAt=Infinity;
      this.flashResetTimer=0;
      this.echoFlashResetTimer=0;
      this.running=true;
      this.visible=true;
      this.revealRunning=false;
      this.revealSequence=0;
      this.revealPromise=null;
      this.revealContent=null;
      this.revealPrepared=false;
      this.frameId=0;
      this.resizeObserver=null;
      this._build();
      this.setOptions(this.options);
      this._resize();
      this._scheduleNextLightning();
      this.frameId=requestAnimationFrame(now=>this._frame(now));
    }

    _build(){
      const root=document.createElement('div');
      root.className='wd-storm-root';
      root.setAttribute('aria-hidden','true');
      root.innerHTML=`
        <div class="wd-storm-clouds"></div>
        <div class="wd-storm-horizon"></div>
        <canvas class="wd-storm-canvas"></canvas>
        <div class="wd-storm-fog"></div>
        <div class="wd-storm-darkness"></div>
        <div class="wd-storm-global-shadow"></div>
        <div class="wd-storm-flash wd-storm-flash-main"></div>
        <div class="wd-storm-flash wd-storm-flash-echo"></div>
        <div class="wd-storm-vignette"></div>
        <div class="wd-storm-reveal-black"></div>`;
      this.root=root;
      this.canvas=root.querySelector('.wd-storm-canvas');
      this.ctx=this.canvas.getContext('2d');
      this.flash=root.querySelector('.wd-storm-flash-main');
      this.echoFlash=root.querySelector('.wd-storm-flash-echo');
      this.darkness=root.querySelector('.wd-storm-darkness');
      this.revealBlack=root.querySelector('.wd-storm-reveal-black');
      this.container.prepend(root);

      this.flash.addEventListener('animationend',()=>this._resetFlashElement(this.flash));
      this.flash.addEventListener('animationcancel',()=>this._resetFlashElement(this.flash));
      this.echoFlash.addEventListener('animationend',()=>this._resetFlashElement(this.echoFlash));
      this.echoFlash.addEventListener('animationcancel',()=>this._resetFlashElement(this.echoFlash));

      if('ResizeObserver' in window){
        this.resizeObserver=new ResizeObserver(()=>this._resize());
        this.resizeObserver.observe(this.container);
      }else{
        this.boundResize=()=>this._resize();
        window.addEventListener('resize',this.boundResize);
      }
    }

    _number(name){return Number(this.options[name])||0}

    setOptions(next={}){
      this.options={...this.options,...next};
      this.root.style.setProperty('--wd-storm-darkness',(this._number('darkness')/100).toFixed(2));
      this.root.style.setProperty('--wd-storm-fog',(this._number('fog')/100).toFixed(2));
      this.root.style.setProperty('--wd-storm-flash-rgb',String(this.options.flashColor||DEFAULTS.flashColor));
      this.root.style.setProperty('--wd-storm-flash-alpha',(this._number('power')/100).toFixed(2));
      this._rebuildDrops();
      this._scheduleNextLightning();
      return this;
    }

    usePreset(name){
      if(!PRESETS[name]) throw new Error(`Onbekende WakkerdamStorm-preset: ${name}`);
      return this.setOptions(PRESETS[name]);
    }

    show(){
      const wasHidden=!this.visible||this.root.hidden;
      this.visible=true;
      this.root.hidden=false;
      if(wasHidden)this._scheduleNextLightning();
      return this;
    }

    _setContentStage(stage,contentElement=this.revealContent){
      this.container.classList.remove('wd-storm-content-hidden','wd-storm-content-shadow','wd-storm-content-card-reveal','wd-storm-content-visible');
      if(stage)this.container.classList.add(`wd-storm-content-${stage}`);
      this.revealContent=contentElement||this.revealContent;
    }

    _clearReveal({showContent=true}={}){
      this.revealSequence+=1;
      this.revealRunning=false;
      this.revealPromise=null;
      this.revealPrepared=false;
      this.root.classList.remove('is-revealing','is-card-reveal-prepared','is-card-revealing','is-revealed');
      this.container.classList.remove('wd-card-reveal-playing','wd-card-reveal-complete');
      this.revealBlack.style.removeProperty('opacity');
      this._resetFlash();
      this._setContentStage('');
      if(showContent&&this.revealContent){
        this.revealContent.style.removeProperty('opacity');
        this.revealContent.style.removeProperty('transform');
      }
    }

    prepareReveal(contentElement=this.container.querySelector('.infoContent')){
      this._clearReveal({showContent:false});
      this.show();
      this.revealContent=contentElement;
      this.root.classList.add('is-card-reveal-prepared');
      this.revealBlack.style.opacity='1';
      this._setContentStage('hidden',contentElement);
      this.nextLightningAt=Infinity;
      this.revealPrepared=true;
      return this;
    }

    revealImmediately(contentElement=this.container.querySelector('.infoContent')){
      this._clearReveal({showContent:false});
      this.show();
      this.revealContent=contentElement;
      this.root.classList.add('is-revealed');
      this.revealBlack.style.opacity='0';
      this.container.classList.add('wd-card-reveal-complete');
      this._setContentStage('visible',contentElement);
      return this;
    }

    hide(){
      this.visible=false;
      this.root.hidden=true;
      this.nextLightningAt=Infinity;
      this._clearReveal({showContent:true});
      this._resetFlash();
      return this;
    }

    _resize(){
      const rect=this.container.getBoundingClientRect();
      this.width=Math.max(1,rect.width);
      this.height=Math.max(1,rect.height);
      this.ratio=Math.min(window.devicePixelRatio||1,1.5);
      this.canvas.width=Math.round(this.width*this.ratio);
      this.canvas.height=Math.round(this.height*this.ratio);
      this.canvas.style.width=this.width+'px';
      this.canvas.style.height=this.height+'px';
      this.ctx.setTransform(this.ratio,0,0,this.ratio,0,0);
      this._rebuildDrops();
    }

    _makeDrop(randomY=true){
      const depth=Math.random();
      return {
        x:Math.random()*(this.width+140)-30,
        y:randomY?Math.random()*this.height:-50-Math.random()*180,
        depth,
        drift:.72+Math.random()*.65,
        speed:.68+depth*.9+Math.random()*.28
      };
    }

    _rebuildDrops(){
      if(!this.width||!this.height)return;
      const count=Math.round(this._number('density')*Math.min(1.3,this.width/520));
      this.drops=Array.from({length:Math.max(20,count)},()=>this._makeDrop(true));
    }

    _scheduleNextLightning(){
      const frequency=this._number('frequency');
      if(!this.options.autoLightning||frequency===0||!this.visible){
        this.nextLightningAt=Infinity;
        return;
      }
      const min=900;
      const max=9500;
      const average=max-(frequency/100)*(max-min);
      this.nextLightningAt=performance.now()+average*(.55+Math.random()*1.15);
    }

    _buildBolt(){
      const segments=[];
      let x=this.width*(.2+Math.random()*.6);
      let y=-8;
      let thickness=2.2+this._number('power')/42;
      const targetY=this.height*(.5+Math.random()*.35);
      while(y<targetY){
        const nextY=y+15+Math.random()*26;
        const nextX=x+(Math.random()-.5)*34;
        segments.push({x1:x,y1:y,x2:nextX,y2:nextY,alpha:1,thickness});
        x=nextX;y=nextY;thickness*=.96;
      }
      const branchCount=Math.max(0,Math.round(this._number('branches')));
      for(let b=0;b<branchCount;b++){
        const source=segments[Math.floor(Math.random()*Math.max(1,segments.length-2))];
        if(!source)continue;
        let bx=source.x2,by=source.y2;
        const branchLength=2+Math.floor(Math.random()*4);
        const side=Math.random()>.5?1:-1;
        for(let i=0;i<branchLength;i++){
          const nx=bx+side*(12+Math.random()*28);
          const ny=by+10+Math.random()*22;
          segments.push({x1:bx,y1:by,x2:nx,y2:ny,alpha:.55,thickness:Math.max(.7,thickness*.55)});
          bx=nx;by=ny;
        }
      }
      return segments;
    }

    _resetFlashElement(element){
      if(!element)return;
      element.classList.remove('is-active','is-reveal-main','is-reveal-echo');
      element.style.removeProperty('opacity');
      element.style.removeProperty('visibility');
      element.style.removeProperty('animation');
    }

    _resetFlash(){
      clearTimeout(this.flashResetTimer);
      clearTimeout(this.echoFlashResetTimer);
      this._resetFlashElement(this.flash);
      this._resetFlashElement(this.echoFlash);
    }

    _activateRevealFlashes(){
      this._resetFlash();
      void this.flash.offsetWidth;
      void this.echoFlash.offsetWidth;
      this.flash.classList.add('is-reveal-main');
      this.echoFlash.classList.add('is-reveal-echo');
      /* Ook de revealflitsen krijgen een hard WebKit-vangnet. */
      this.flashResetTimer=setTimeout(()=>this._resetFlashElement(this.flash),2350);
      this.echoFlashResetTimer=setTimeout(()=>this._resetFlashElement(this.echoFlash),2350);
    }

    triggerLightning(){
      if(!this.visible)return this;
      this.lightningSegments=this._buildBolt();
      this.lightningUntil=performance.now()+430;
      this._resetFlash();
      void this.flash.offsetWidth;
      this.flash.classList.add('is-active');
      /* Extra vangnet voor iOS/WebKit: de overlay kan nooit wit blijven hangen. */
      this.flashResetTimer=setTimeout(()=>this._resetFlash(),650);
      this._scheduleNextLightning();
      return this;
    }

    _drawLightning(now){
      if(now>this.lightningUntil||!this.lightningSegments.length)return;
      const remaining=Math.max(0,(this.lightningUntil-now)/430);
      this.ctx.save();
      this.ctx.lineCap='round';
      this.ctx.shadowColor=`rgba(${this.options.flashColor},.9)`;
      this.ctx.shadowBlur=11;
      for(const segment of this.lightningSegments){
        this.ctx.beginPath();
        this.ctx.moveTo(segment.x1,segment.y1);
        this.ctx.lineTo(segment.x2,segment.y2);
        this.ctx.strokeStyle=`rgba(${this.options.flashColor},${segment.alpha*remaining})`;
        this.ctx.lineWidth=segment.thickness;
        this.ctx.stroke();
      }
      this.ctx.restore();
    }

    _frame(now){
      if(!this.running)return;
      const dt=Math.min(.034,(now-this.lastTime)/1000);
      this.lastTime=now;
      if(this.visible){
        this.ctx.clearRect(0,0,this.width,this.height);
        const baseSpeed=this._number('speed');
        const wind=this._number('wind');
        const length=this._number('length');
        const thickness=this._number('thickness');
        const brightness=this._number('brightness')/100;
        this.ctx.save();
        this.ctx.lineCap='round';
        for(const drop of this.drops){
          const vy=baseSpeed*drop.speed;
          const vx=-wind*drop.drift; // rechtsboven -> linksonder
          drop.x+=vx*dt;
          drop.y+=vy*dt;
          if(drop.y>this.height+70||drop.x<-120){
            Object.assign(drop,this._makeDrop(false));
            drop.x=Math.random()*(this.width+260)+40;
          }
          const normal=Math.hypot(vx,vy)||1;
          const dx=(vx/normal)*length*(.65+drop.depth*.7);
          const dy=(vy/normal)*length*(.65+drop.depth*.7);
          const alpha=brightness*(.2+drop.depth*.72);
          this.ctx.beginPath();
          this.ctx.moveTo(drop.x,drop.y);
          this.ctx.lineTo(drop.x-dx,drop.y-dy);
          this.ctx.strokeStyle=`rgba(198,220,240,${alpha})`;
          this.ctx.lineWidth=thickness*(.5+drop.depth*.8);
          this.ctx.stroke();
        }
        this.ctx.restore();
        this._drawLightning(now);
        if(now>=this.nextLightningAt)this.triggerLightning();
      }
      this.frameId=requestAnimationFrame(t=>this._frame(t));
    }

    revealWinner(contentElement=this.container.querySelector('.infoContent')){
      if(this.revealRunning&&this.revealPromise)return this.revealPromise;
      const alreadyPrepared=this.revealPrepared
        && this.revealContent===contentElement
        && this.root.classList.contains('is-card-reveal-prepared')
        && this.container.classList.contains('wd-storm-content-hidden');
      if(!alreadyPrepared)this.prepareReveal(contentElement);
      const sequence=this.revealSequence;
      this.revealRunning=true;
      const active=()=>this.running&&this.visible&&sequence===this.revealSequence;

      this.root.classList.remove('is-card-reveal-prepared','is-revealed');
      this.root.classList.add('is-card-revealing');
      this.container.classList.remove('wd-card-reveal-complete');
      this.container.classList.add('wd-card-reveal-playing');
      this._setContentStage('card-reveal',contentElement);
      [...contentElement.querySelectorAll('.winnerPlayerCard')].forEach((card,index)=>{
        card.style.setProperty('--card-index',String(index));
      });
      this._activateRevealFlashes();

      this.revealPromise=(async()=>{
        await wait(1040);
        if(!active())return false;
        this.lightningSegments=this._buildBolt();
        this.lightningUntil=performance.now()+840;
        await wait(5160);
        if(!active())return false;
        this.root.classList.remove('is-card-revealing');
        this.root.classList.add('is-revealed');
        this.container.classList.remove('wd-card-reveal-playing');
        this.container.classList.add('wd-card-reveal-complete');
        this.revealBlack.style.opacity='0';
        this._setContentStage('visible',contentElement);
        this._scheduleNextLightning();
        this.revealRunning=false;
        this.revealPromise=null;
        return true;
      })();
      return this.revealPromise;
    }

    destroy(){
      this.running=false;
      cancelAnimationFrame(this.frameId);
      clearTimeout(this.flashResetTimer);
      clearTimeout(this.echoFlashResetTimer);
      this._clearReveal({showContent:true});
      this.resizeObserver?.disconnect();
      if(this.boundResize)window.removeEventListener('resize',this.boundResize);
      this.root.remove();
      this.container.classList.remove('wd-storm-content-hidden','wd-storm-content-shadow','wd-storm-content-card-reveal','wd-storm-content-visible','wd-card-reveal-playing','wd-card-reveal-complete');
    }
  }

  window.WakkerdamStorm={
    DEFAULTS,
    PRESETS,
    mount(container,options){return new StormEffect(container,options)}
  };
})();

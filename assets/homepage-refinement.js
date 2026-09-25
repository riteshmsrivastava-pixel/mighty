'use strict';
(() => {
  const audienceCast=new Map([...examples,heroPerson,...networkPeople,
    {id:'sarah',name:'Sarah Park',initials:'SP',color:'#D9D7F1',ink:'#51478C',shortRole:'Operations leader'},
    {id:'emily',name:'Emily Walsh',initials:'EW',color:'#D9D7F1',ink:'#51478C',shortRole:'Product executive'},
  ].map(person=>[person.id,person]));
  const supportingRoles={aishah:'Enterprise AI founder',daniel:'Business development',thomas:'Engineering mentor',carlos:'Community leader'};
  const audienceGoals={
    career:{kicker:'YOUR NEXT ROLE',title:'Meet people who know your next chapter.',description:'Hiring leaders, peers and people who’ve made the move.',people:['priya','evelyn','sam']},
    funding:{kicker:'YOUR NEXT INVESTOR',title:'Find investors who understand your ambition.',description:'Relevant investors and founders with fundraising experience.',people:['david','jordan','fatima']},
    customers:{kicker:'YOUR NEXT CUSTOMER',title:'Get closer to the people you can help.',description:'Buyers, decision-makers and potential early adopters.',people:['sarah','emily','priya']},
    cofounders:{kicker:'YOUR NEXT CO-FOUNDER',title:'Find someone to build with.',description:'Builders with complementary skills and shared interests.',people:['aishah','sam','fatima']},
    mentors:{kicker:'YOUR NEXT MENTOR',title:'Learn from someone who’s been there.',description:'Experienced leaders with a perspective on your next move.',people:['evelyn','thomas','priya']},
    partners:{kicker:'YOUR NEXT PARTNER',title:'Meet people you can grow with.',description:'Collaborators, community builders and business partners.',people:['carlos','daniel','fatima']},
  };
  function showAudience(key){
    const selected=audienceGoals[key];
    if(!selected)return;
    document.querySelectorAll('[data-audience]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.audience===key)));
    document.getElementById('audience-kicker').textContent=selected.kicker;
    document.getElementById('audience-outcome').textContent=selected.title;
    document.getElementById('audience-explanation').textContent=selected.description;
    const cards=selected.people.map(id=>{
      const person=audienceCast.get(id),card=makeNode('div','audience-person'),avatar=makeNode('span','avatar');
      paintAvatar(avatar,person);
      card.append(avatar,makeNode('strong','',person.name),makeNode('small','',person.shortRole||supportingRoles[id]));
      return card;
    });
    document.getElementById('audience-people').replaceChildren(...cards);
  }
  document.querySelectorAll('[data-audience]').forEach(button=>button.addEventListener('click',()=>showAudience(button.dataset.audience)));
  showAudience('career');
  const comparisonPerson=examples.find(person=>person.id==='priya');
  ['difference-profile-avatar','difference-mighty-avatar'].forEach(id=>{
    const avatar=document.getElementById(id);
    if(avatar)paintAvatar(avatar,comparisonPerson);
  });
  document.querySelectorAll('[data-difference-person]').forEach(avatar=>{
    const person=audienceCast.get(avatar.dataset.differencePerson);
    if(person)paintAvatar(avatar,person);
  });
  // Homepage-only comparisons. These actions never touch an account, send a
  // message, or persist notes. Keep the full examples readable without JS.
  const differenceTabs=[...document.querySelectorAll('.difference-tabs [role="tab"]')];
  if(differenceTabs.length){
    const differencePanels=differenceTabs.map(tab=>document.getElementById(tab.getAttribute('aria-controls')));
    const previous=document.getElementById('difference-prev');
    const next=document.getElementById('difference-next');
    let differenceIndex=0,outreachRecorded=false;
    const comparison=document.getElementById('why-mighty');
    const storyMotion=matchMedia('(prefers-reduced-motion: reduce)');
    const playButton=document.getElementById('difference-play');
    let playRequested=!storyMotion.matches,storyVisible=false,storyBeat=0,storyTimer=null;
    const storyScenes=[
      {labels:['State your goal','Find familiar people','Explore beyond'],steps:[
        '.mock-search-field,.difference-query',
        '.search-result-example,.difference-search-group:nth-of-type(3)',
        '.manual-search-task,.difference-search-group:nth-of-type(4)'
      ]},
      {labels:['Read the background','Compare your goals','Understand the fit'],steps:[
        '.mock-profile-cover,.mock-profile-body>.difference-person,.with-mighty>.difference-person',
        '.mock-profile-about,.difference-fit-grid',
        '.difference-reason,.difference-shared'
      ]},
      {labels:['Save the reason','See your relationships','Record progress'],steps:[
        '.sheet-toolbar,.sheet-formula,.mini-workspace-toolbar',
        '.mock-sheet table,.mini-board,.mini-people-list',
        '.difference-demo-action'
      ]},
      {labels:['Bring your context','Prepare your approach','Draft, then decide'],steps:[
        '.mock-chat-prompt,.mini-preparation',
        '.mock-chat-reply,.mini-draft',
        '.difference-decision,.difference-decision-status'
      ]},
      {labels:['Remember the meeting','Capture what mattered','Keep your next step'],steps:[
        '.fragment-meeting,.mini-timeline li:nth-child(1)',
        '.fragment-note,.mini-timeline li:nth-child(2),.difference-note-form',
        '.fragment-message,.timeline-next'
      ]}
    ];
    storyScenes.forEach((scene,i)=>scene.steps.forEach((selector,beat)=>{
      differencePanels[i].querySelectorAll(selector).forEach(node=>node.dataset.storyBeat=String(beat));
    }));
    function motionAllowed(){return !storyMotion.matches&&!document.documentElement.classList.contains('motion-paused');}
    function applyStoryBeat(beat){
      storyBeat=beat;
      const panel=differencePanels[differenceIndex];
      panel.dataset.storyFrame=String(beat);
      panel.querySelectorAll('[data-story-beat]').forEach(node=>{
        node.classList.toggle('story-revealed',Number(node.dataset.storyBeat)<=beat);
        node.classList.toggle('story-highlight',Number(node.dataset.storyBeat)===beat);
      });
      document.querySelectorAll('[data-story-label]').forEach((node,i)=>{
        node.textContent=storyScenes[differenceIndex].labels[i];
        node.classList.toggle('is-current',i===beat);
        node.classList.toggle('is-complete',i<beat);
      });
      if(differenceIndex===2&&playRequested&&motionAllowed())setBoardStage(beat===2,false);
    }
    function syncStory(){
      clearTimeout(storyTimer);
      const running=playRequested&&motionAllowed()&&storyVisible&&!document.hidden;
      comparison.classList.toggle('comparison-playing',running);
      playButton.textContent=playRequested&&motionAllowed()?'Ⅱ Pause':'▷ Play';
      playButton.setAttribute('aria-label',playRequested&&motionAllowed()?'Pause comparison animation':'Play comparison animation');
      playButton.setAttribute('aria-pressed',String(!playRequested||!motionAllowed()));
      playButton.disabled=!motionAllowed();
      document.getElementById('difference-replay').disabled=!motionAllowed();
      if(running)storyTimer=setTimeout(()=>{applyStoryBeat((storyBeat+1)%3);syncStory();},storyBeat===2?4600:2600);
    }
    function pauseStory(){playRequested=false;syncStory();}
    function showDifference(index,focus=false){
      differenceIndex=Math.max(0,Math.min(differenceTabs.length-1,index));
      differenceTabs.forEach((tab,i)=>{
        const selected=i===differenceIndex;
        tab.setAttribute('aria-selected',String(selected));
        tab.tabIndex=selected?0:-1;
        differencePanels[i].hidden=!selected;
        differencePanels[i].classList.toggle('is-active',selected);
        if(selected&&focus)tab.focus();
      });
      previous.disabled=differenceIndex===0;
      next.disabled=differenceIndex===differenceTabs.length-1;
      document.getElementById('difference-position').textContent=String(differenceIndex+1).padStart(2,'0')+' / '+String(differenceTabs.length).padStart(2,'0');
      applyStoryBeat(0);syncStory();
    }
    differenceTabs.forEach((tab,i)=>{
      tab.addEventListener('click',()=>showDifference(i));
      tab.addEventListener('keydown',event=>{
        let target;
        if(event.key==='ArrowRight')target=(i+1)%differenceTabs.length;
        if(event.key==='ArrowLeft')target=(i+differenceTabs.length-1)%differenceTabs.length;
        if(event.key==='Home')target=0;
        if(event.key==='End')target=differenceTabs.length-1;
        if(target===undefined)return;
        event.preventDefault();showDifference(target,true);
      });
    });
    previous.addEventListener('click',()=>showDifference(differenceIndex-1));
    next.addEventListener('click',()=>showDifference(differenceIndex+1));
    document.querySelector('.difference-navigation').hidden=false;
    document.querySelector('.difference-playback').hidden=false;
    document.querySelectorAll('#difference-note-form [disabled]').forEach(control=>{control.disabled=false;});
    document.querySelector('.difference-slides').classList.add('is-interactive');
    showDifference(0);
    playButton.addEventListener('click',()=>{playRequested=!playRequested;syncStory();});
    document.getElementById('difference-replay').addEventListener('click',()=>{playRequested=true;applyStoryBeat(0);syncStory();});
    if('IntersectionObserver' in window){
      const storyObserver=new IntersectionObserver(entries=>{storyVisible=entries[0].isIntersecting&&entries[0].intersectionRatio>=.12;syncStory();},{threshold:.12});
      storyObserver.observe(document.querySelector('.difference-slides'));
    }else{storyVisible=true;syncStory();}
    document.addEventListener('visibilitychange',syncStory);
    storyMotion.addEventListener('change',syncStory);
    new MutationObserver(syncStory).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
    document.getElementById('difference-note').addEventListener('focus',pauseStory);
    document.querySelectorAll('[data-difference-view]').forEach(button=>{
      button.addEventListener('click',()=>{
        pauseStory();
        const board=button.dataset.differenceView==='board';
        document.getElementById('difference-board').hidden=!board;
        document.getElementById('difference-list').hidden=board;
        document.querySelectorAll('[data-difference-view]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
      });
    });
    function setBoardStage(recorded,announce=true){
      if(recorded===outreachRecorded)return;
      outreachRecorded=recorded;
      const card=document.getElementById('difference-priya-card');
      const potential=document.getElementById('difference-potential');
      const reached=document.getElementById('difference-reached');
      const before=card.getBoundingClientRect();
      (outreachRecorded?reached:potential).append(card);
      const after=card.getBoundingClientRect();
      if(motionAllowed()&&before.width&&after.width){
        card.getAnimations().forEach(animation=>animation.cancel());
        card.animate([{transform:'translate('+(before.x-after.x)+'px,'+(before.y-after.y)+'px)',boxShadow:'0 0 0 2px #D5B2FF'},{transform:'translate(0,0)',boxShadow:'0 0 0 0 transparent'}],{duration:850,easing:'cubic-bezier(.2,.8,.2,1)'});
      }
      card.querySelector('small').textContent=outreachRecorded?'Waiting for a reply':'Prepare a conversation';
      potential.querySelector('h5 span').textContent=outreachRecorded?'0':'1';
      reached.querySelector('h5 span').textContent=outreachRecorded?'2':'1';
      document.getElementById('difference-priya-stage').textContent=outreachRecorded?'Reached out':'Potential';
      if(announce)document.getElementById('difference-board-status').textContent=outreachRecorded?'Priya moved to Reached out. No message was sent.':'Example reset. Priya is back in Potential.';
      document.getElementById('difference-record-outreach').textContent=outreachRecorded?'Reset demo stage ↺':'Record outreach to Priya →';
    }
    document.getElementById('difference-record-outreach').addEventListener('click',()=>{
      pauseStory();setBoardStage(!outreachRecorded);
    });
    document.querySelectorAll('[data-difference-decision]').forEach(button=>{
      button.addEventListener('click',()=>{
        pauseStory();
        document.querySelectorAll('[data-difference-decision]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
        document.getElementById('difference-decision-status').textContent=button.dataset.differenceDecision==='save'?'Saved in this example. No invitation or message was sent.':'Not added in this example. Your focus stays with your goal.';
      });
    });
    document.getElementById('difference-note-form').addEventListener('submit',event=>{
      event.preventDefault();
      pauseStory();
      const input=document.getElementById('difference-note');
      const status=document.getElementById('difference-note-status');
      const note=input.value.trim();
      if(!note){status.textContent='Write a note first. Nothing has been saved.';input.focus();return;}
      let item=document.querySelector('.difference-saved-note');
      if(!item){
        item=makeNode('li','difference-saved-note');
        const point=makeNode('span','timeline-point');point.setAttribute('aria-hidden','true');
        const copy=makeNode('div','');
        copy.append(makeNode('strong','','Your note'),makeNode('p','',''));
        item.append(point,copy);
        document.querySelector('#difference-follow .mini-timeline').append(item);
      }
      item.querySelector('p').textContent=note;
      input.value='';
      status.textContent='Note saved in this demo only. Reloading clears it.';
    });
  }
  const tabs=[...document.querySelectorAll('.workflow-tabs [role="tab"]')];
  const panels=tabs.map(tab=>document.getElementById(tab.getAttribute('aria-controls')));
  function showPanel(id,{focus=false}={}){
    if(!panels.some(panel=>panel.id===id))return;
    tabs.forEach((tab,i)=>{
      const selected=panels[i].id===id;
      tab.setAttribute('aria-selected',String(selected));
      tab.tabIndex=selected?0:-1;
      panels[i].hidden=!selected;
      if(selected&&focus)tab.focus();
    });
  }
  window.showMightyPanel=showPanel;
  tabs.forEach((tab,i)=>{
    tab.addEventListener('click',()=>showPanel(panels[i].id));
    tab.addEventListener('keydown',event=>{
      let next;
      if(event.key==='ArrowRight')next=(i+1)%tabs.length;
      if(event.key==='ArrowLeft')next=(i+tabs.length-1)%tabs.length;
      if(event.key==='Home')next=0;
      if(event.key==='End')next=tabs.length-1;
      if(next===undefined)return;
      event.preventDefault();showPanel(panels[next].id,{focus:true});
    });
  });
  function revealAnchor(hash){
    const id=hash.replace(/^#/,'');
    showPanel(id);
    if(id==='your-world')document.querySelector('.context-details').open=true;
  }
  // Reveal hidden destinations before native anchor scrolling runs, including
  // dynamically inserted Save/View links. Back/forward links work as well.
  document.addEventListener('click',event=>{
    const link=event.target.closest('a[href^="#"]');
    if(link)revealAnchor(link.getAttribute('href'));
  });
  window.addEventListener('hashchange',()=>{
    revealAnchor(location.hash);
    const target=document.getElementById(location.hash.slice(1));
    target?.scrollIntoView({block:'start',behavior:'instant'});
  });
  function reviewPerson(id){
    profileIndex=examples.findIndex(person=>person.id===id);
    goal=examples[profileIndex].defaultGoal;
    renderProfile();setDraft(examples[profileIndex],goal);
    showPanel('in-the-moment');
    document.getElementById('workflow').scrollIntoView({block:'start',behavior:motionPaused?'instant':'smooth'});
    document.getElementById('tab-in-the-moment').focus({preventScroll:true});
  }
  document.getElementById('review-entry').addEventListener('click',()=>reviewPerson(discoveryPeople[entry]));
  document.getElementById('review-beyond').addEventListener('click',()=>reviewPerson('jordan'));
  // No-JS browsers retain every example; hide inactive panels only now.
  showPanel('discovery');
  revealAnchor(location.hash);
})();

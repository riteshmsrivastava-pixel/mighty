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
  // No-JS browsers retain all four examples; hide inactive panels only now.
  showPanel('discovery');
  revealAnchor(location.hash);
})();

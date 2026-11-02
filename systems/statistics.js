import { RegisteredSystem } from './runtime.js';

export class StatisticsSystem extends RegisteredSystem {
  constructor(runtime) {
    super(runtime, 'statistics');
    this.registry.state.active = false;
    this.registry.functions.open = () => this.open();
    this.groups = [
      ['World Population', ['Population', 'Births today', 'Deaths today', 'Population growth']],
      ['Government & Economics', ['Government spending', 'Public debt', 'Healthcare spending', 'Education spending']],
      ['Society & Media', ['Internet users', 'Social media', 'Books published', 'Newspapers circulated']],
      ['Environment', ['Forests lost', 'CO₂ emissions', 'Desertification', 'Toxic chemicals']],
      ['Food & Water', ['Undernourished people', 'Obesity', 'Water used', 'People without safe water']],
      ['Energy', ['Energy consumption', 'Renewable energy', 'Oil remaining', 'Gas remaining']],
      ['Health', ['Deaths by cause', 'Disease burden', 'Health indicators']]
    ];
  }
  node(tag, className, content) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (content !== undefined) el.textContent = content;
    return el;
  }
  link(label, href) {
    const a = this.node('a', '', label);
    a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer';
    return a;
  }
  async open({ immediate = false } = {}) {
    if (this.registry.state.active) return;
    this.registry.state.active = true;
    if (location.hash !== '#statistics') history.replaceState(null, '', `${location.pathname}${location.search}#statistics`);
    const main = this.runtime.main;
    const animation = this.runtime.registry.systems.animation;
    const transition = immediate ? null : animation.animate(main, [{opacity:1,filter:'blur(0px)',transform:'scale(1)'},{opacity:0,filter:'blur(18px)',transform:'scale(.91)'}], {duration:2200,easing:'ease-in-out',fill:'forwards'});
    if (transition) await transition.finished.catch(() => {});
    main.remove();
    const dashboard = this.node('section','dashboard terminal-dashboard');
    const panels = this.node('div','terminal-grid');
    const worldSection = this.node('section','stats-section terminal-pane streaming-pane');
    worldSection.append(this.node('h2','','WORLD DATA STREAM'));
    const worldFeed = this.node('div','terminal-feed');
    worldFeed.setAttribute('role','log'); worldFeed.setAttribute('aria-label','World data stream');
    worldSection.append(worldFeed);
    const populationFooter = this.node('div','population-footer');
    const populationLabel = this.node('span','population-label','WORLD POPULATION / LIVE ESTIMATE');
    const populationValue = this.node('strong','population-live-value','—');
    populationValue.setAttribute('aria-label','Estimated world population');
    const populationSource = this.node('a','population-source','populationclock.org · modeled projection');
    populationSource.href = 'https://populationclock.org/';
    populationSource.target = '_blank'; populationSource.rel = 'noopener noreferrer';
    populationFooter.append(populationLabel,populationValue,populationSource);
    this.loadPopulation(populationValue);
    panels.append(worldSection);
    const debt = this.node('section','stats-section terminal-pane streaming-pane');
    debt.append(this.node('h2','','DEBT CLOCK STREAM'));
    const debtFeed = this.node('div','terminal-feed');
    debtFeed.setAttribute('role','log'); debtFeed.setAttribute('aria-label','Government debt estimates');
    debt.append(debtFeed); panels.append(debt);
    this.registry.state.worldFeed = worldFeed;
    this.registry.state.debtFeed = debtFeed;
    this.registry.state.worldSequence = 0;
    this.registry.state.worldTopics = [
      'WORLD / Population, health, environment and energy charts available below',
      'POPULATION / Global population projection is a model, not a census',
      'HEALTH / Life expectancy and child mortality datasets: publisher-updated',
      'ENVIRONMENT / Annual CO₂ emissions: publisher-updated, not a live sensor',
      'ENERGY / Renewable energy share: latest published research series',
      'SOCIETY / Internet use statistics: latest published research series',
      'DATA / Our World in Data interactive charts are available below',
      'STATUS / Waiting for newly published measurements and datasets'
    ];
    this.appendFeed(worldFeed,'SYSTEM / WORLD DATA STREAM INITIALIZED');
    this.registry.state.worldInterval = setInterval(() => {
      const topics = this.registry.state.worldTopics;
      this.appendFeed(worldFeed,topics[this.registry.state.worldSequence++ % topics.length]);
    },1600);
    const health = this.node('section','stats-section terminal-pane streaming-pane');
    health.append(this.node('h2','','POPULATION & HEALTH STREAM'));
    const healthFeed = this.node('div','terminal-feed');
    healthFeed.setAttribute('role','log'); healthFeed.setAttribute('aria-label','Population and health statistics');
    health.append(healthFeed); panels.append(health);
    const environment = this.node('section','stats-section terminal-pane streaming-pane');
    environment.append(this.node('h2','','ENVIRONMENT, ENERGY & SOCIETY STREAM'));
    const environmentFeed = this.node('div','terminal-feed');
    environmentFeed.setAttribute('role','log'); environmentFeed.setAttribute('aria-label','Environment energy and society statistics');
    environment.append(environmentFeed); panels.append(environment);
    this.startResearchStream(healthFeed,[
      ['Population growth','population-growth-rate','% per year'],
      ['Life expectancy','life-expectancy','years'],
      ['Under-five mortality','child-mortality','%'],
      ['Daily food supply','daily-per-capita-caloric-supply','kcal/person/day']
    ]);
    this.startResearchStream(environmentFeed,[
      ['Annual CO₂ emissions','annual-co2-emissions-per-country','tonnes/year'],
      ['CO₂ per capita','co2-emissions-per-capita','tonnes/person/year'],
      ['Renewable energy share','renewable-share-energy','%'],
      ['Internet users','number-of-internet-users','people'],
      ['Internet usage share','share-of-individuals-using-the-internet','%']
    ]);
    dashboard.append(panels,populationFooter);document.body.append(dashboard);
    const fade = animation.animate(dashboard,[{opacity:0,transform:'translateY(24px)'},{opacity:1,transform:'translateY(0)'}],{duration:1000,easing:'ease-out',fill:'both'});
    if (fade) fade.finished.catch(()=>{});
    await this.loadDebt(debtFeed);
    this.emit('dashboard-opened');
  }
  startResearchStream(container, sources) {
    const state = {next:0, records:new Map(), lastRefresh:0, refreshing:false};
    const refresh = async () => {
      if(state.refreshing) return;
      state.refreshing = true;
      this.appendFeed(container,'DATASET / Refreshing published research series (not live measurements)');
      try {
        for(const [label,slug,unit] of sources) {
          const controller = new AbortController();
          const timeout = setTimeout(()=>controller.abort(),18000);
          try {
            const response = await fetch('https://ourworldindata.org/grapher/'+slug+'.csv',{signal:controller.signal,cache:'no-cache'});
            if(!response.ok) throw new Error('HTTP '+response.status);
            const csv = await response.text();
            const lines = csv.split(/\r?\n/);
            const candidates = new Map();
            for(let i=1;i<lines.length;i++) {
              const line = lines[i];
              if(!line) continue;
              const cells = line.split(',');
              if(cells.length!==4) continue;
              const year = Number(cells[2]), value = Number(cells[3]);
              if(!Number.isInteger(year)||!Number.isFinite(value))continue;
              const code=cells[1],entity=cells[0];
              if(code==='OWID_WRL'||entity==='World'||code==='USA'||code==='IND'||code==='FIN'||code==='NLD') {
                const key=code==='OWID_WRL'||entity==='World'?'World':entity;
                const prior=candidates.get(key);
                if(!prior||year>prior.year)candidates.set(key,{year,value});
              }
            }
            if(!candidates.size) throw new Error('No supported country/world records');
            state.records.set(slug,{label,unit,candidates,source:'ourworldindata.org/grapher/'+slug});
            this.appendFeed(container,'SOURCE OK / '+label+' · '+candidates.size+' geographic series');
          } catch(error) {
            this.appendFeed(container,'SOURCE UNAVAILABLE / '+label+' · '+String(error).slice(0,75));
          } finally { clearTimeout(timeout); }
        }
        state.lastRefresh=Date.now();
      } finally {state.refreshing=false;}
    };
    const output=()=>{
      const [label,slug]=sources[state.next++%sources.length];
      const record=state.records.get(slug);
      if(!record){this.appendFeed(container,'WAITING / '+label+' · published data pending');return;}
      const preferred=['World','United States','India','Finland','Netherlands'];
      const available=preferred.filter(key=>record.candidates.has(key));
      const key=available[Math.floor((state.next-1)/sources.length)%available.length];
      if(!key){this.appendFeed(container,'DATA UNAVAILABLE / '+label);return;}
      const {year,value}=record.candidates.get(key);
      const display=new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(value);
      this.appendFeed(container,label.toUpperCase()+' / '+key+' / '+display+' '+record.unit+' / '+year+' · published');
    };
    this.appendFeed(container,'SYSTEM / PUBLISHER DATA STREAM INITIALIZED');
    this.appendFeed(container,'NOTICE / Repeated lines are refreshed displays of latest published annual data');
    refresh();
    const stream=setInterval(output,1400);
    const updater=setInterval(refresh,1800000);
    (this.registry.state.researchIntervals??=[]).push(stream,updater);
  }
  embedCharts(container, charts) {
    const tabs = this.node('div','chart-tabs');
    const viewport = this.node('div','chart-viewport');
    const frames = [];
    charts.forEach(([title, slug], index) => {
      const button = this.node('button','chart-tab',title);
      button.type = 'button'; button.setAttribute('aria-pressed',String(index===0));
      const frame = this.node('iframe','chart-frame');
      frame.title = title + ' · Our World in Data';
      frame.loading = 'lazy';
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      frame.allow = 'web-share; clipboard-write';
      frame.dataset.source = 'https://ourworldindata.org/grapher/' + slug + '?tab=chart';
      frame.hidden = index!==0;
      if(index===0)frame.src=frame.dataset.source;
      frames.push(frame); viewport.append(frame);
      button.addEventListener('click',()=>{
        frames.forEach((item,i)=>{item.hidden=i!==index;});
        if(!frame.src)frame.src=frame.dataset.source;
        for(const child of tabs.children)child.setAttribute('aria-pressed',String(child===button));
        this.emit('chart-selected',{title});
      });
      tabs.append(button);
    });
    container.append(tabs,viewport);
  }
  async loadPopulation(value) {
    const update = async () => {
      try {
        const response = await fetch('https://populationclock.org/embed-data.json',{cache:'no-store'});
        if(!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        if(!Number.isInteger(data.currentYear) || !Number.isFinite(data.world?.start) || !Number.isFinite(data.world?.end)) throw new Error('Invalid population data');
        const start = Date.UTC(data.currentYear,0,1);
        const end = Date.UTC(data.currentYear+1,0,1);
        this.registry.state.populationProjection = {start,end,from:data.world.start,to:data.world.end};
        this.emit('population-data-loaded',{year:data.currentYear});
      } catch(error) {
        this.emit('population-data-unavailable',{reason:String(error)});
        if(!this.registry.state.populationProjection) value.textContent='Population estimate unavailable';
      }
    };
    const tick = () => {
      const model = this.registry.state.populationProjection;
      if(!model || !value.isConnected) return;
      const fraction = Math.min(1,Math.max(0,(Date.now()-model.start)/(model.end-model.start)));
      value.textContent = Math.floor(model.from+(model.to-model.from)*fraction).toLocaleString('en-US');
    };
    await update(); tick();
    this.registry.state.populationInterval = setInterval(tick,1000);
    this.registry.state.populationRefresh = setInterval(update,3600000);
  }
  appendFeed(container, message) {
    if (!container?.isConnected) return;
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 75;
    const line = this.node('div','feed-line');
    const time = new Date().toLocaleTimeString('en-GB',{hour12:false});
    line.append(this.node('span','feed-time','[' + time + ']'),this.node('span','feed-message',message));
    container.append(line);
    while (container.childElementCount > 120) container.firstElementChild.remove();
    if (nearBottom) container.scrollTop = container.scrollHeight;
  }
  async loadDebt(container) {
    try {
      const response = await fetch('https://www.global-debt-clock.com/data/debt.json');
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      const formatter = new Intl.NumberFormat('en-US',{maximumFractionDigits:0});
      const countries = ['world','fi','nl','in'].map(key=>data[key]).filter(entry=>entry && Number.isFinite(entry.base) && Number.isFinite(entry.rate));
      if (!countries.length) throw new Error('No usable debt data');
      this.appendFeed(container,'SOURCE / Global Debt Clock · IMF-based extrapolated estimates · USD');
      this.appendFeed(container,'MODEL / base debt + elapsed seconds × estimated rate');
      const update = () => {
        const entry = countries[this.registry.state.debtSequence++ % countries.length];
        const baseTime = Date.parse(entry.baseDate + 'T00:00:00Z');
        const amount = Math.max(0,entry.base + entry.rate * ((Date.now()-baseTime)/1000));
        this.appendFeed(container,entry.name.toUpperCase() + ' / $' + formatter.format(amount) + ' · ' + entry.gdpPct + '% GDP · modeled');
      };
      this.registry.state.debtSequence = 0;
      for(let i=0;i<countries.length;i++) update();
      this.registry.state.interval = setInterval(update,1000);
      this.emit('debt-loaded',{count:countries.length});
    } catch(error) {
      this.appendFeed(container,'SOURCE UNAVAILABLE / ' + String(error));
      this.emit('debt-unavailable',{reason:String(error)});
    }
  }
  dispose() { if(this.registry.state.interval) clearInterval(this.registry.state.interval); if(this.registry.state.worldInterval) clearInterval(this.registry.state.worldInterval); if(this.registry.state.populationInterval) clearInterval(this.registry.state.populationInterval); if(this.registry.state.populationRefresh) clearInterval(this.registry.state.populationRefresh); for(const timer of this.registry.state.researchIntervals||[]) clearInterval(timer); }
}

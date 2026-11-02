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
    const populationFrame = this.node('iframe','population-inline-frame');
    populationFrame.src = 'https://populationclock.org/embed';
    populationFrame.title = 'Live world population estimate';
    populationFrame.loading = 'eager';
    populationFrame.referrerPolicy = 'strict-origin-when-cross-origin';
    populationFrame.setAttribute('sandbox','allow-scripts allow-same-origin');
    populationFooter.append(populationLabel,populationFrame);
    worldSection.append(populationFooter); panels.append(worldSection);
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
    const contextPane = this.node('section','stats-section terminal-pane');
    contextPane.append(this.node('h2','','Population & Health'));
    contextPane.append(this.node('p','disclaimer','Publisher-updated interactive charts; not second-by-second measurements.'));
    this.embedCharts(contextPane,[
      ['Population growth','population-growth-rate'],
      ['Life expectancy','life-expectancy'],
      ['Child mortality','child-mortality'],
      ['Food supply','daily-per-capita-caloric-supply']
    ]);
    panels.append(contextPane);
    const monitorPane = this.node('section','stats-section terminal-pane');
    monitorPane.append(this.node('h2','','Environment, Energy & Society'));
    monitorPane.append(this.node('p','disclaimer','Latest published research series, automatically updated by their provider.'));
    this.embedCharts(monitorPane,[
      ['Annual CO₂ emissions','annual-co2-emissions-per-country'],
      ['CO₂ per person','co2-emissions-per-capita'],
      ['Renewable energy share','renewable-share-energy'],
      ['Internet users','number-of-internet-users'],
      ['Internet usage share','share-of-individuals-using-the-internet']
    ]);
    panels.append(monitorPane);
    dashboard.append(panels);document.body.append(dashboard);
    const fade = animation.animate(dashboard,[{opacity:0,transform:'translateY(24px)'},{opacity:1,transform:'translateY(0)'}],{duration:1000,easing:'ease-out',fill:'both'});
    if (fade) fade.finished.catch(()=>{});
    await this.loadDebt(debtFeed);
    this.emit('dashboard-opened');
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
  dispose() { if(this.registry.state.interval) clearInterval(this.registry.state.interval); if(this.registry.state.worldInterval) clearInterval(this.registry.state.worldInterval); }
}

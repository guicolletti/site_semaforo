// app.js - Controle MQTT / UI
// Requisitos: mqtt.min.js carregado no HTML.

const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const brokerInput = document.getElementById('brokerInput');
const clientIdInput = document.getElementById('clientIdInput');
const connectDot = document.getElementById('connDot');
const connText = document.getElementById('connText');

const startBtn = document.getElementById('startBtn');
const stopBtn  = document.getElementById('stopBtn');
const topicCmd  = document.getElementById('topicCmd');
const topicStatus = document.getElementById('topicStatus');

const stateLabel = document.getElementById('stateLabel');
const activeLabel = document.getElementById('activeLabel');
const lastMsg = document.getElementById('lastMsg');
const lastAt = document.getElementById('lastAt');
const logEl = document.getElementById('log');

const lights = {
  carRed: document.getElementById('car-red'),
  carYellow: document.getElementById('car-yellow'),
  carGreen: document.getElementById('car-green'),
  pedRed: document.getElementById('ped-red'),
  pedGreen: document.getElementById('ped-green')
};

let client = null;
let isConnected = false;

// helpers
function log(msg){
  const time = new Date().toLocaleTimeString();
  logEl.innerText = `[${time}] ${msg}\n` + logEl.innerText;
}

function setConn(connected){
  isConnected = connected;
  connectDot.classList.toggle('online', connected);
  connectDot.classList.toggle('offline', !connected);
  connText.innerText = connected ? 'Conectado' : 'Desconectado';
  connectBtn.disabled = connected;
  disconnectBtn.disabled = !connected;
  startBtn.disabled = !connected;
  stopBtn.disabled = !connected;
}

// ui: atualiza as luzes
function updateLights(state, active){
  // remove classes
  Object.values(lights).forEach(el => el.classList.remove('on'));
  if(!state) {
    stateLabel.innerText = '—';
    activeLabel.innerText = active ? 'Sim' : 'Não';
    return;
  }

  stateLabel.innerText = state;
  activeLabel.innerText = active ? 'Sim' : 'Não';

  // map state names (flexível)
  const s = state.toLowerCase();
  if(s.includes('verde') && s.includes('carro') || s === 'carro_verde' || s === 'verde'){
    lights.carGreen.classList.add('on');
    lights.pedRed.classList.add('on');
  } else if(s.includes('amarelo') || s === 'carro_amarelo'){
    lights.carYellow.classList.add('on');
    lights.pedRed.classList.add('on');
  } else if(s.includes('vermelho') || s === 'carro_vermelho'){
    lights.carRed.classList.add('on');
    lights.pedGreen.classList.add('on');
  } else if(s === 'desligado' || s === 'parado'){
    // nothing
  } else {
    // try parse simple tokens "verde/amarelo/vermelho"
    if(s === 'verde'){
      lights.carGreen.classList.add('on'); lights.pedRed.classList.add('on');
    } else if(s === 'amarelo'){
      lights.carYellow.classList.add('on'); lights.pedRed.classList.add('on');
    } else if(s === 'vermelho'){
      lights.carRed.classList.add('on'); lights.pedGreen.classList.add('on');
    }
  }
}

// receber status (JSON esperado)
function handleStatusMessage(message){
  let parsed;
  try {
    parsed = JSON.parse(message);
  } catch (e) {
    log(`Status recebido (não JSON): ${message}`);
    lastMsg.innerText = message;
    lastAt.innerText = new Date().toLocaleString();
    return;
  }

  const active = !!parsed.active;
  const state = parsed.state || null;
  lastMsg.innerText = JSON.stringify(parsed, null, 2);
  lastAt.innerText = new Date().toLocaleString();
  updateLights(state, active);
  log(`Status -> active:${active} state:${state}`);
}

// conectar
function connectMQTT(){
  const broker = brokerInput.value.trim();
  let clientId = clientIdInput.value.trim();
  if(!clientId) clientId = 'web-client-' + Math.random().toString(16).slice(2,10);

  try {
    client = mqtt.connect(broker, {clientId, clean:true, connectTimeout: 4000, reconnectPeriod: 2000});
  } catch (err){
    log('Erro ao construir cliente MQTT: ' + err);
    return;
  }

  log(`Conectando ao broker ${broker} (clientId=${clientId})...`);
  client.on('connect', () => {
    setConn(true);
    const st = topicStatus.value.trim();
    if(st) client.subscribe(st, {qos:0}, (err) => {
      if(err) log('Erro subscribe: ' + err);
      else log('Inscrito em ' + st);
    });
    log('Conectado com sucesso');
  });

  client.on('reconnect', () => {
    log('Reconectando...');
  });

  client.on('error', (e) => {
    log('Erro MQTT: ' + e);
  });

  client.on('message', (topic, payload) => {
    const txt = payload.toString();
    if(topic === topicStatus.value.trim()){
      handleStatusMessage(txt);
    } else {
      log(`Mensagem em ${topic}: ${txt}`);
    }
  });

  client.on('close', () => {
    setConn(false);
    log('Conexão fechada');
  });
}

// desconectar
function disconnectMQTT(){
  if(client){
    try { client.end(); } catch(e){ console.warn(e); }
    client = null;
  }
  setConn(false);
  log('Desconectado manualmente');
  updateLights(null, false);
}

// publicar comando
function publishCmd(cmd){
  if(!client || !isConnected){
    log('Não conectado. Conecte ao broker antes de enviar comandos.');
    return;
  }
  const topic = topicCmd.value.trim();
  if(!topic){ log('Tópico de comando vazio'); return; }
  client.publish(topic, cmd, {qos:0}, (err) => {
    if(err) log('Erro publicar: ' + err);
    else log(`Publicado em ${topic}: ${cmd}`);
  });
}

// eventos UI
connectBtn.addEventListener('click', () => connectMQTT());
disconnectBtn.addEventListener('click', () => disconnectMQTT());

startBtn.addEventListener('click', () => {
  publishCmd('INICIAR');
  // otimista: atualiza UI imediatamente
  updateLights('verde', true);
});

stopBtn.addEventListener('click', () => {
  publishCmd('PARAR');
  updateLights(null, false);
});

// habilita/disabilita botões conforme conexão inicial (desconectado)
setConn(false);
log('Painel inicializado. Configure o broker e clique em Conectar.');

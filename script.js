// app.js - Sincronização estrita com ESP via MQTT

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
let lastStatusReceivedAt = 0;

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

// update UI from authoritative status
function updateLightsFromState(state, active){
  Object.values(lights).forEach(el => el.classList.remove('on'));
  stateLabel.innerText = state || '—';
  activeLabel.innerText = active ? 'Sim' : 'Não';
  if(!state) return;
  const s = state.toLowerCase();
  if(s.includes('verde') && s.includes('carro') || s === 'carro_verde' || s === 'verde'){
    lights.carGreen.classList.add('on'); lights.pedRed.classList.add('on');
  } else if(s.includes('amarelo') || s === 'carro_amarelo'){
    lights.carYellow.classList.add('on'); lights.pedRed.classList.add('on');
  } else if(s.includes('vermelho') || s === 'carro_vermelho'){
    lights.carRed.classList.add('on'); lights.pedGreen.classList.add('on');
  } else {
    // fallback simples
    if(s === 'verde'){ lights.carGreen.classList.add('on'); lights.pedRed.classList.add('on'); }
    if(s === 'amarelo'){ lights.carYellow.classList.add('on'); lights.pedRed.classList.add('on'); }
    if(s === 'vermelho'){ lights.carRed.classList.add('on'); lights.pedGreen.classList.add('on'); }
  }
  lastStatusReceivedAt = Date.now();
}

// handle incoming status payload (JSON expected)
function handleStatusMessage(message){
  try {
    const parsed = JSON.parse(message);
    lastMsg.innerText = JSON.stringify(parsed, null, 2);
    lastAt.innerText = new Date().toLocaleString();
    updateLightsFromState(parsed.state, !!parsed.active);
    log(`Status recebido -> active:${parsed.active} state:${parsed.state}`);
  } catch(e){
    // se não for JSON, só exibe
    lastMsg.innerText = message;
    lastAt.innerText = new Date().toLocaleString();
    log('Status recebido (não JSON): ' + message);
  }
}

// connect
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

  log(`Conectando ao broker ${broker}...`);
  client.on('connect', () => {
    setConn(true);
    const st = topicStatus.value.trim();
    // subscribe ao tópico de status
    client.subscribe(st, {qos:0}, (err) => {
      if(err) log('Erro subscribe: ' + err);
      else {
        log('Inscrito em ' + st);
        // solicitar status atual (redundante se retained estiver ativo)
        client.publish('semaforo/get', 'GET');
      }
    });
    log('Conectado');
  });

  client.on('reconnect', () => { log('Reconectando...'); });
  client.on('error', (e) => { log('Erro MQTT: ' + e); });
  client.on('close', () => { setConn(false); log('Conexão fechada'); updateLightsFromState(null,false); });

  client.on('message', (topic, payload) => {
    const txt = payload.toString();
    if(topic === topicStatus.value.trim()){
      handleStatusMessage(txt);
    } else {
      log(`Mensagem em ${topic}: ${txt}`);
    }
  });
}

// disconnect
function disconnectMQTT(){
  if(client){
    try { client.end(); } catch(e){ console.warn(e); }
    client = null;
  }
  setConn(false);
  log('Desconectado manualmente');
  updateLightsFromState(null,false);
}

// publish command (INICIAR/PARAR)
function publishCmd(cmd){
  if(!client || !isConnected){ log('Não conectado'); return; }
  const topic = topicCmd.value.trim();
  if(!topic){ log('Tópico vazio'); return; }
  client.publish(topic, cmd, {qos:0}, (err) => {
    if(err) log('Erro publicar: ' + err);
    else log(`Publicado em ${topic}: ${cmd}`);
    // NÃO fazer atualização otimista; aguardamos mensagem em semaforo/status
  });
}

// UI events
connectBtn.addEventListener('click', () => connectMQTT());
disconnectBtn.addEventListener('click', () => disconnectMQTT());
startBtn.addEventListener('click', () => publishCmd('INICIAR'));
stopBtn.addEventListener('click', () => publishCmd('PARAR'));

// periodic check: se não receber status há > X segundos, mostra "offline"
setInterval(() => {
  if(isConnected && lastStatusReceivedAt){
    const ago = Date.now() - lastStatusReceivedAt;
    if(ago > 10000){ // 10s sem status
      log('Atenção: sem atualização de status nos últimos 10s');
      // não limpa as luzes, mas marca texto
      stateLabel.innerText = stateLabel.innerText + ' (sem atualização)';
    }
  }
}, 5000);

// inicial
setConn(false);
log('Painel inicializado. Conecte ao broker para sincronizar com o ESP.');

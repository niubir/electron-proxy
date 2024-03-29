const path = require('path')
const { init: proxy_init, configNodes } = require('@niubir/electron-proxy')

proxy_init({
  xfutureConfig: {
    path: path.join(__dirname, 'node_modules/xfuture'),
    password: 'INPUT_YOUT_PASSWORD',
  }
}).then(()=>{
  console.info('proxy init success')
}).catch(err=>{
  console.error('proxy init failed:', err)
  process.exit(1)
})

configNodes({
  nodes: [{
    url: 'vmess://...'
  }],
  doPick: false,
  doStart: true,
  doClose: false,
})
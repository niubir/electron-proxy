const { app } = require('electron')
const { init: proxy_init, configNodes, quit } = require('./index')

proxy_init({
  xfuturePassword: '88991237'
}).then(()=>{
  console.info('proxy init success')
}).catch(err=>{
  console.error('proxy init failed:', err)
  process.exit(1)
})

configNodes({
  nodes: [{
    url: 'vmess://ew0KICAidiI6ICIyIiwNCiAgInBzIjogIvCfh6/wn4e15pel5pysQTAyfOWliOmjnnxHUFQiLA0KICAiYWRkIjogIjE4My4yMzIuMTcwLjIxIiwNCiAgInBvcnQiOiAiMzAwMjUiLA0KICAiaWQiOiAiNTRmYzI1MDQtZjhkMS00NmY5LTlmZjUtZjQxOTk1M2QwMmZiIiwNCiAgImFpZCI6ICIwIiwNCiAgInNjeSI6ICJhdXRvIiwNCiAgIm5ldCI6ICJ0Y3AiLA0KICAidHlwZSI6ICJub25lIiwNCiAgImhvc3QiOiAiIiwNCiAgInBhdGgiOiAiIiwNCiAgInRscyI6ICIiLA0KICAic25pIjogIiIsDQogICJhbHBuIjogIiIsDQogICJmcCI6ICIiDQp9'
  }],
  doPick: false,
  doStart: true,
  doClose: false,
})

// if (!app.requestSingleInstanceLock()) {
//   app.quit()
// } else {
  
//   app.whenReady().then(async () => {
    
//   })
// }
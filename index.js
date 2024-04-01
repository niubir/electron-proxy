const fs = require('fs')
const path = require('path')
const { v4: new_uuid } = require('uuid')
const xParser = require('xfuture/parser')
const xEngine = require('xfuture/index')
const ini = require('ini')
const { closeProxy } = require('./sysproxy')

let ini_file_path = './proxy.ini'
let default_type = 'proxy'
let default_mode = 'rule'
let sync_func = null
let xfuture_config = {
  password: '',
  install_shell_path: '',
  install_helper_path: '',
  tun_config_path: '',
  resource_path: '',
}

let engine = {
  loaded: false,
  status: 'off',
  statusOnTime: null,

  type: default_type,
  mode: default_mode,

  nodes: [],
  groups: [],
  userAllowIDs: [],

  currentNode: null,
  currentGroup: null,

  delaies: {},
}

const init_engine = () => {
  engine.loaded = false
  engine.status = 'off'
  engine.statusOnTime = null
  engine.nodes = []
  engine.groups = []
  engine.userAllowIDs = []
  engine.currentNode = null
  engine.currentGroup = null
  engine.delaies = {}
}

const init = ({
  iniFilePath = './proxy.ini',
  defaultType = 'proxy',
  defaultMode = 'rule',
  syncFunc = (engine) => {
    console.log('sync proxy:', engine)
  },
  xfutureConfig = {
    path: '',
    password: '',
  },
}) => {
  return new Promise(async (resolve, reject) => {
    ini_file_path = iniFilePath
    default_type = defaultType
    default_mode = defaultMode
    sync_func = syncFunc
    xfuture_config = {
      password: xfutureConfig.password,
      install_shell_path: get_xfuture_install_shell_path(xfutureConfig.path),
      install_helper_path: get_xfuture_install_helper_path(xfutureConfig.path),
      tun_config_path: get_xfuture_tun_config_path(xfutureConfig.path),
      resource_path: get_xfuture_resource_path(xfutureConfig.path),
    }

    engine.type = get_type()
    engine.mode = get_mode()

    init_engine()

    try {
      xEngine.InstallDriver(xfuture_config.install_shell_path, xfuture_config.install_helper_path)
      xEngine.SetPassword(xfuture_config.password)
    } catch (err) {
      reject(err)
      return
    }

    try {
      xEngine.StopProxy()
      xEngine.StopTunnel()
      await closeProxy()
    } catch (err) {
      console.error('init do sysproxy close failed:', err)
    }

    process.on('SIGINT', () => {
      quit()
      process.exit(0)
    })
    resolve()
  })
}

const quit = () => {
  return new Promise(async (resolve, reject) => {
    try {
      xEngine.StopProxy()
      xEngine.StopTunnel()
      await closeProxy()
    } catch (err) {
      console.error('quit do sysproxy close failed:', err)
    }
    resolve()
  })
}

const reload = () => {
  return new Promise(async (resolve, reject) => {
    try {
      xEngine.StopProxy()
      xEngine.StopTunnel()
      await closeProxy()
      init_engine()
    } catch (err) {
      reject(err)
      return
    }
    resolve()
  })
}

const get = () => {
  return engine
}

/*
node struct:
{
  url: xxx,
  [id: xxx],
  [name: xxx],
  [groupIDs: [xxx]],
  [allowIDs: [xxx]],
}
*/
const configNodes = ({
  nodes = [],
  groups = [],
  userAllowIDs = [],
  doPick = true,
  doStart = false,
  doClose = true,
}) => {
  return new Promise(async (resolve, reject) => {
    let groupIDNodes = {}
    for (let i in nodes) {
      let node = nodes[i]
      if (!node.url) {
        continue
      }
      if (!node.id) {
        node.id = new_uuid()
      }
      const url_info = xParser.parse(node.url)
      if (!node.name) {
        node.name = url_info.remark
      }
      node.address = url_info.address
      node.port = url_info.port
      nodes[i] = node
      if (!node.groupIDs) {
        node.groupIDs = []
      }
      if (!node.allowIDs) {
        node.allowIDs = []
      }
      if (node.allowIDs.length > 0) {
        node.allow = node.allowIDs.some(item => userAllowIDs.includes(item))
      } else {
        node.allow = true
      }
  
      for (let groupID of node.groupIDs) {
        let groupNodes = groupIDNodes[groupID]
        if (!groupNodes) {
          groupNodes = []
        }
        groupNodes.push(node)
        groupIDNodes[groupID] = groupNodes
      }
    }
    for (let i in groups) {
      let group = groups[i]
      group.nodes = groupIDNodes[group.id] || []
      group.allow = false
      for (let node of group.nodes) {
        if (node.allow) {
          group.allow = true
          break
        }
      }
      groups[i] = group
    }
    
    engine.nodes = nodes || []
    engine.groups = groups || []
    engine.userAllowIDs = userAllowIDs || []
    engine.loaded = true

    if (doPick) {
      try {
        await set_current()
      } catch (err) {
        console.error('configNodes do pick failed:', err)
      }
    }
    if (doStart) {
      try {
        await start()
      } catch (err) {
        console.error('configNodes do start failed:', err)
      }
    }
    if (doClose) {
      try {
        await close()
      } catch (err) {
        console.error('configNodes do close failed:', err)
      }
    }

    sync_engine()
    resolve()
  })
}

const changeType = (type) => {
  return new Promise(async (resolve, reject) => {
    engine.type = type
    change_ini_do()

    if (engine.status == 'on') {
      try {
        await start()
      } catch (err) {
        reject(err)
        return
      }
    }

    sync_engine()
    resolve()
  })
}

const changeMode = (mode) => {
  return new Promise(async (resolve, reject) => {
    engine.mode = mode
    change_ini_do()

    if (engine.status == 'on') {
      try {
        await start()
      } catch (err) {
        reject(err)
        return
      }
    }

    sync_engine()
    resolve()
  })
}

const changeGroup = (groupID) => {
  return new Promise(async (resolve, reject) => {
    try {
      await set_current(groupID, null)
    } catch (err) {
      reject(err)
      return
    }
    if (engine.status == 'on') {
      try {
        await start()
      } catch (err) {
        reject(err)
        return
      }
    }

    sync_engine()
    resolve()
  })
}

const changeNode = (nodeID) => {
  return new Promise(async (resolve, reject) => {
    try {
      await set_current(null, nodeID)
    } catch (err) {
      reject(err)
      return
    }
    if (engine.status == 'on') {
      try {
        await start()
      } catch (err) {
        reject(err)
        return
      }
    }

    sync_engine()
    resolve()
  })
}

const start = () => {
  return new Promise(async (resolve, reject) => {
    if (!engine.currentNode) {
      try {
        await set_current(null, null)
      } catch (err) {
        reject(err)
        return
      }
    }

    xEngine.StopTunnel()

    let tunEnable = false
    if (engine.type == 'tun') {
      tunEnable = true
    }
    xEngine.SetTunModeEnable(tunEnable, xfuture_config.resource_path, xfuture_config.tun_config_path)

    let globalEnable = false
    if (engine.mode = 'global') {
      globalEnable = true
    }
    xEngine.SetGlobalMode(globalEnable, xfuture_config.resource_path)

    if (!xEngine.StartTunnel(engine.currentNode.url)) {
      reject('start_failed')
      return
    }

    let statusOnTime = Date.now()
    if (engine.status === 'on') {
      statusOnTime = engine.statusOnTime
    }

    engine.status = 'on'
    engine.statusOnTime = statusOnTime

    sync_engine()
    resolve()
  })
}

const close = () => {
  return new Promise((resolve, reject) => {
    try {
      xEngine.StopTunnel()
      xEngine.SetTunModeEnable(false, xfuture_config.resource_path, xfuture_config.tun_config_path)
      engine.status = 'off'
      engine.statusOnTime = null
    } catch (err) {
      reject(err)
      return
    }

    sync_engine()
    resolve()
  })
}


const set_current = (groupID, nodeID) => {
  return new Promise((resolve, reject) => {
    let usebleNodes = []
    for (let node of engine.nodes) {
      if (!node.allow) {
        continue
      }
      if (nodeID && node.id != nodeID) {
        continue
      }
      if (groupID && !node.groupIDs.includes(groupID)) {
        continue
      }
      usebleNodes.push(node)
    }
    if (usebleNodes.length == 0) {
      reject('no_allow_node')
      return
    }
    usebleNodes.sort((a, b) => {
      const a_delay = engine.delaies[a.id] || 0
      const b_delay = engine.delaies[b.id] || 0
      const a_score = a_delay * 100
      const b_score = b_delay * 100
      if (a_score != b_score) {
        return a_score - b_score
      } else {
        return a.name.localeCompare(b.name)
      }
    })

    engine.currentNode = usebleNodes[0]
    if (!groupID && usebleNodes[0].groupIDs.length > 0) {
      groupID = usebleNodes[0].groupIDs[0]
    }
    if (groupID) {
      for (let group of engine.groups) {
        if (group.id == groupID) {
          engine.currentGroup = group
          break
        }
      }
    }

    resolve()
  })
}
const change_ini_do = () => {
  set_proxy_ini(engine.type, engine.mode)
}
const sync_engine = () => {
  if (sync_func) {
    sync_func(engine)
  }
}

const set_proxy_ini = (type, mode) => {
  if (!ini_file_path) {
    return
  }
  fs.writeFileSync(ini_file_path, ini.stringify({
    type: type,
    mode: mode,
  }, {
    section: 'section',
  }))
}
const get_proxy_ini = () => {
  let type = default_type
  let mode = default_mode
  if (ini_file_path && fs.existsSync(ini_file_path)) {
    const config = ini.parse(fs.readFileSync(ini_file_path, 'utf-8'))
    if (config && 'section' in config && 'type' in config.section) {
      type = config.section.type
    }
    if (config && 'section' in config && 'mode' in config.section) {
      mode = config.section.mode
    }
  }
  return {
    type: type,
    mode: mode,
  }
}
const get_type = () => {
  return get_proxy_ini().type
}
const get_mode = () => {
  return get_proxy_ini().mode
}
const get_xfuture_install_shell_path = (xfuturePath) => {
  switch (process.platform) {
    case 'win32':
      return 'maodou'
    case 'darwin':
      return path.join(xfuturePath, '/package/mac/install_helper.sh')
    default:
      return ''
  }
}
const get_xfuture_install_helper_path = (xfuturePath) => {
  switch (process.platform) {
    case 'win32':
      return path.join(xfuturePath, '/package/windows/sysproxy.exe')
    case 'darwin':
      return path.join(xfuturePath, '/package/mac/install_helper.sh')
    default:
      return ''
  }
}
const get_xfuture_tun_config_path = (xfuturePath) => {
  switch (process.platform) {
    case 'win32':
      return path.join(xfuturePath, '/package/windows/sing-box-global.json')
    case 'darwin':
      return ''
    default:
      return ''
  }
}
const get_xfuture_resource_path = (xfuturePath) => {
  return path.join(xfuturePath, '/resources')
}

module.exports = {
  init,
  quit,
  reload,
  get,
  configNodes,
  changeType,
  changeMode,
  changeGroup,
  changeNode,
  start,
  close,
}
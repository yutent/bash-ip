#!/usr/bin/env node

require('es.shim')
const os = require('os')
const path = require('path')
const pg = require('progress')
const cp = require('child_process')
const chalk = require('chalk')

const print = console.log
const VERSION = '0.0.1'

let args = process.argv.slice(2)
let af = 4

function run(cmd) {
  try {
    return cp.execSync(cmd).toString('utf8')
  } catch (err) {
    return false
  }
}

// 打印网卡接口信息
function networkInterfaces() {
  let result = os.networkInterfaces()
  print(chalk.green.bold(os.hostname()))
  for (let k in result) {
    let info = ''
    let base = ''
    for (let it of result[k]) {
      base = `MAC ${it.mac}  INTERNAL ${chalk.yellow(it.internal)}`
      info += `${it.family.padStart(12)} ${chalk.green(it.address)}  NETMASK ${
        it.netmask
      } \n`
    }
    print('%s %s\n%s', chalk.blue.bold((k + ':').padEnd(8)), base, info)
  }
}

function routeList() {
  let result
  if (af === 6) {
    result = run(`netstat -nr -f inet6 2>/dev/null`)
  } else {
    result = run(`netstat -nr -f inet 2>/dev/null`)
  }
  if (result === false) {
    return
  }
  result = result.split('\n')
  result.splice(0, 3)
  result[0] = chalk.blue(result[0])
  print(result.join('\n'))
}

function routeGet(addr) {
  let result = run(`route -n get ${addr}`)
  let dict = {}
  result = result.split('\n')
  for (let it of result) {
    it = it.split(':')
    if (it.length < 2) {
      continue
    }
    dict[it[0].trim().replace(/\s+/g, '_')] = it[1].trim()
  }

  let { route_to, interface, gateway } = dict
  let src = run(
    `python -c "import socket;s = socket.socket(socket.AF_INET${
      af === 6 ? '6' : ''
    }, socket.SOCK_DGRAM);s.connect(('${addr}',7));print(s.getsockname()[0])"`
  )
  src = src.trim()

  print(
    `${route_to} ${
      gateway ? 'via ' + gateway : ''
    }  dev ${interface}  src ${src}`
  )
}

function routeAdd(dev = 'dev', addr) {
  if (!addr) {
    return
  }
  let inet = 'inet' + (af === 6 ? '6' : '')
  let result = run(`sudo ifconfig ${dev} ${inet} add ${addr}`)
  if (result === false) {
    print(chalk.red('route add failed'))
  }
}

function routeDel(dev = 'dev', addr) {
  if (!addr) {
    return
  }
  let inet = 'inet' + (af === 6 ? '6' : '')
  let result = run(`sudo ifconfig ${dev} ${inet} ${addr} remove`)
  if (result === false) {
    print(chalk.red('route delete failed'))
  }
}

function parseIfconfigArr(arr) {
  let i = 0

  for (let k of arr) {
    k = k.split(/\s{1,2}/)
    if (k.length < 3) {
      continue
    }
    if (i === 0) {
      i = 1
      k[0] = chalk.blue.bold(k[0].padEnd(8))
    } else {
      k.shift()
      if (k.length === 2) {
        k[0] = k[0].padStart(8)
      } else {
        if (k[0] === '') {
          k[0] = ' '.repeat(8)
        }
        if (k[1] === '') {
          k[1] = ' '.repeat(7)
        }
        if (k[3] === '' && k[4] === '') {
          k.splice(3, 2)
        }
        if (k[2] === '') {
          k.splice(2, 1)
        }
        if (['ether', 'inet', 'inet6'].includes(k[1])) {
          k[2] = chalk.green(k[2])
        } else if ('status:' === k[1]) {
          k[2] = chalk.yellow(k[2])
        }
      }
    }

    print(k.join(' '))
  }
}

function doIfconfig() {
  let result = run('ifconfig')
    .replace(/\t/g, '    ')
    .trim()

  result = result.replace(/([\w]+: flags=.*\n)/g, '=====$1').split('=====')
  !result[0] && result.shift()

  for (let it of result) {
    it = it.split('\n')
    parseIfconfigArr(it)
    print('\n')
  }
}

function doIfconfigOne(flag) {
  let result = run(`ifconfig ${flag}`)
    .replace(/\t/g, '    ')
    .trim()

  result = result.split('\n')
  parseIfconfigArr(result)
}

function doHelp() {
  print('Usage: ip [ OPTIONS ] OBJECT { COMMAND | help }')
  print('    ', 'ip a[ddress]', '打印网卡的IP信息')
  print('    ', 'ip route [add|list|delete|get]', '路由相关信息及操作')
  print('    ', 'ip link', '打印网卡的详细信息')
  print('    ', 'ip -V[--version]', '打印版本信息')
  print('    ', 'ip -h[--help]', '打印帮助信息')
  print()
}

function printVersion() {
  print('ip, v%s', VERSION)
}

if (!args.length) {
  doHelp()
  process.exit()
}

if (args[0] === '-6') {
  af = 6
  args.shift()
}

if (args[0] === '-4') {
  af = 4
  args.shift()
}

switch (args[0]) {
  case 'link':
    args.shift()
    if (args.length === 0) {
      doIfconfig()
      break
    }
    if (args[0] === 'show' && args.length === 2) {
      args.shift()
      doIfconfigOne(args[0])
      break
    }
    break
  case 'a':
  case 'address':
    networkInterfaces()
    break
  case 'route':
    args.shift()
    if (!args.length || ['list', 'show', 'lst', 'ls'].includes(args[0])) {
      routeList()
      break
    }
    if (args[0] === 'get' && args.length === 2) {
      routeGet(args[1])
      break
    }
    if (args[0] === 'add' && args.length === 3) {
      routeAdd(args[1], args[2])
    }

    if (args[0] === 'delete' && args.length === 3) {
      routeDel(args[1], args[2])
    }
    break
  case '-V':
  case '--version':
    printVersion()
    break
  default:
    break
    doHelp()
}

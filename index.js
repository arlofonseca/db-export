require('dotenv').config()

const axios = require('axios')
const cron = require('node-cron')
const { exec } = require('child_process')
const fs = require('fs')
const mysql = require('mysql2/promise')
const path = require('path')
const readline = require('readline')

const host = process.env.DB_HOST
const user = process.env.DB_USER
const password = process.env.DB_PASSWORD
const name = process.env.DB_NAME
const dir = path.resolve(__dirname, 'db')

const webhook = process.env.WEBHOOK_URL

let connection = false

const client = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

const sendDiscordWebhookMessage = async (description, color) => {
  try {
    await axios.post(webhook, {
      embeds: [
        {
          title: 'Database Backup',
          description: description,
          color: color
        }
      ]
    })
  } catch (error) {
    console.error(`Error sending discord webhook message: ${error}`)
  }
}

const getConnection = async () => {
  if (!connection || connection.connection._closing) {
    connection = await mysql.createConnection({
      host: host,
      user: user,
      password: password,
      database: name
    })
  }
  console.info(connection)
  return connection
}

const checkConnection = async () => {
  try {
    await getConnection()
    console.log(`Connected to database. Host: ${host} | User: ${user} | Password: ${password} | Database: ${name} | Webhook: ${webhook}`)
    await sendDiscordWebhookMessage(`\`🟢\` Successfully connected to database`, 0x008000)
  } catch (error) {
    console.error(`Error connecting to database: ${error.message}`)
    process.exit(1)
  }
}

const initBackup = async (db) => {
  const date = new Date().toISOString().replace(/[:.]/g, '-')
  const vim = Math.floor(Math.random() * 9000) + 1000
  const file = path.join(dir, `${db}_backup_${date}_(g${vim}).sql`)
  const command = `mariadb-dump --user=${user} --password=${password} ${db}`

  console.log(`${new Date().toLocaleTimeString()}: Backing up database (${db}) to (${file})...`)

  try {
    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(file)
      const child = exec(command, { maxBuffer: 1024 * 1024 * 10 })

      console.info(output)
      console.info(child)

      child.stdout.pipe(output)
      child.stderr.pipe(process.stderr)

      console.info(process.stderr)

      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Error: ${code}`))
        } else {
          resolve()
        }
      })
    })

    console.log(`Successfully generated backup: ${file}`)
    await sendDiscordWebhookMessage(`\`🟢\` Backup created (g${vim})`, 0x008000)
  } catch (error) {
    console.error(`Error generating backup: ${error.message}`)
    await sendDiscordWebhookMessage(`\`🔴\` Backup failed (g${vim})`, 0x800000)
  }
}

cron.schedule('0 * * * *', async () => {
  console.log('Generating database backup.')
  await initBackup(name)
})

client.on('line', async (input) => {
  const [command] = input.trim().split(' ')

  switch (command) {
    case 'backup':
      const database = input.trim().split(' ')[1] || name
      console.log(`Manual backup for database (${database}) initiated.`)
      await sendDiscordWebhookMessage(`\`🟢\` Manual backup for database (${database}) initiated`, 0x008000)
      await initBackup(database)
      break
    default:
      console.log('Unknown command.')
      break
  }
})

process.on('uncaughtException', async (err) => {
  console.error(`Uncaught exception: ${err.message}`)
  await sendDiscordWebhookMessage(`\`🔴\` Uncaught exception: ${err.message}`, 0x800000)
})

process.on('unhandledRejection', async (reason, promise) => {
  console.error(`Unhandled rejection at: ${promise}, reason: ${reason}`)
  await sendDiscordWebhookMessage(`\`🔴\` Unhandled rejection at: ${promise}, reason: ${reason}`, 0x800000)
})

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down.')
  await sendDiscordWebhookMessage(`\`🔴\` Disconnected from database`, 0x800000)
  process.exit(0)
})

checkConnection()

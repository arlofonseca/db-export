require('dotenv').config()

const axios = require('axios')
const cron = require('node-cron')
const { exec } = require('child_process')
const fs = require('fs')
const path = require('path')
const readline = require('readline')

const user = process.env.DB_USER
const password = process.env.DB_PASSWORD
const name = process.env.DB_NAME
const dir = path.resolve(__dirname, 'db')

const webhook = process.env.WEBHOOK_URL

const client = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

const sendDiscordWebhookMessage = async (title, description, color) => {
  try {
    await axios.post(webhook, {
      embeds: [
        {
          title: title,
          description: description,
          color: color
        }
      ]
    })
  } catch (error) {
    console.error('Error sending message:', error)
  }
}

const generateRandomNumber = (length) => {
  const min = Math.pow(10, length - 1)
  const max = Math.pow(10, length) - 1
  return Math.floor(Math.random() * (max - min + 1)) + min
}

const initBackup = async (db) => {
  const date = new Date().toISOString().replace(/[:.]/g, '-')
  const timestamp = new Date().toLocaleTimeString()
  const vim = generateRandomNumber(4)
  const file = path.join(dir, `${db}_backup_${date}_g${vim}.sql`)
  const command = `mariadb-dump --user=${user} --password=${password} ${db}`

  console.log(`Backup started at ${timestamp}`)
  console.log(`Backing up database ${db} to ${file}...`)

  const start = Date.now()

  try {
    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(file)
      const child = exec(command, { maxBuffer: 1024 * 1024 * 10 })

      child.stdout.pipe(output)
      child.stderr.pipe(process.stderr)

      child.stdout.on('data', (data) => {
        console.log(data)
      })

      child.on('close', (code) => {
        if (code !== 0) {
          console.error(`Backup failed with code ${code}`)
          reject(new Error(`Backup failed with code ${code}`))
        } else {
          resolve()
        }
      })
    })

    const end = Date.now()
    const duration = (end - start) / 1000
    console.log(`Backup created successfully: ${file} in ${duration} seconds`)
    await sendDiscordWebhookMessage(
      'Database Backup',
      `\`🟢\` Backup created (g${vim}) in ${duration} seconds`,
      0x008000
    )
  } catch (error) {
    console.error('Error taking backup:', error.message)
    await sendDiscordWebhookMessage(
      'Database Backup',
      `\`🔴\` Backup failed (g${vim})`,
      0x800000
    )
  }
}

cron.schedule('0 * * * *', async () => {
  console.log('Generating database backup...')
  await initBackup(name)
})

client.on('line', async (input) => {
  const [command] = input.trim().split(' ')

  switch (command) {
    case 'backup':
      const database = input.trim().split(' ')[1] || name
      console.log(`Manual backup for database (${database}) initiated...`)
      await initBackup(database)
      break
    default:
      console.log('Unknown command.')
      break
  }
})

process.on('uncaughtException', (err) => {
  console.error(`Uncaught exception: ${err.message}`)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error(`Unhandled rejection at: ${promise}, reason: ${reason}`)
})

console.log(`Connected to database. User: ${user} | Database: ${name} | Password: ${password} | Webhook: ${webhook}`)

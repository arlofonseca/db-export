require('dotenv').config()

const axios = require('axios')
const cron = require('node-cron')
const readline = require('readline')
const path = require('path')
const fs = require('fs')
const { exec } = require('child_process')

const db = path.resolve(__dirname, 'db')
const {
  USER: DB_USER,
  PASSWORD: DB_PASSWORD,
  NAME: DB_NAME,
  LOG_CHANNEL: WEBHOOK
} = process.env

if (!DB_USER || !DB_PASSWORD || !DB_NAME || !WEBHOOK) {
  console.error('Environment variables missing.')
  process.exit(1)
}

if (!fs.existsSync(db)) {
  fs.mkdirSync(db)
}

const client = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

const sendDiscordWebhookMessage = async (title, description, color) => {
  try {
    await axios.post(WEBHOOK, {
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

const initBackup = async () => {
  const date = new Date().toISOString().replace(/[:.]/g, '-')
  const timestamp = new Date().toLocaleTimeString()
  const vim = generateRandomNumber(4)
  const file = path.join(db, `${DB_NAME}_backup_${date}_g${vim}.sql`)
  const command = `mariadb-dump --user=${DB_USER} --password=${DB_PASSWORD} ${DB_NAME}`

  console.log(`Backup started at ${timestamp}`)
  console.log(`Backing up database ${DB_NAME} to ${file}...`)

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
  await initBackup()
})

client.on('line', async (input) => {
  const [command] = input.trim().split(' ')

  switch (command) {
    case 'backup':
      console.log('Manual backup initiated...')
      await initBackup()
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
  console.error(`Unhandled rejection at: ${promise}, reason: ${reason.message}`)
})

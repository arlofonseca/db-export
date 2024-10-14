require('dotenv').config()

const cron = require('node-cron')
const path = require('path')
const fs = require('fs')
const { exec } = require('child_process')

const db = path.resolve(__dirname, 'db')
const { USER: DB_USER, PASSWORD: DB_PASSWORD, NAME: DB_NAME } = process.env

if (!DB_USER || !DB_PASSWORD || !DB_NAME) {
  console.error('Environment variables missing.')
  process.exit(1)
}

if (!fs.existsSync(db)) {
  fs.mkdirSync(db)
}

const execute = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Backup failed: ${stderr || stdout}`)
        return reject(new Error(stderr.trim()))
      }
      resolve(stdout.trim())
    })
  })
}

const initBackup = async () => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = path.join(db, `${DB_NAME}_backup_${timestamp}.sql`)
  const command = `mariadb-dump --user=${DB_USER} --password=${DB_PASSWORD} ${DB_NAME} > "${file}"`

  try {
    await execute(command)
    console.log(`Backup created successfully: ${file}`)
  } catch (error) {
    console.error('Error taking backup:', error.message)
  }
}

cron.schedule('0 * * * *', () => {
  console.log('Generating database backup...')
  initBackup()
})

process.on('uncaughtException', (err) => {
  console.error(`Uncaught exception: ${err.message}`)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error(`Unhandled rejection at: ${promise}, reason: ${reason.message}`)
})

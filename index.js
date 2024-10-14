require('dotenv').config()

const cron = require('node-cron')
const { exec } = require('child_process')
const path = require('path')
const fs = require('fs')

const db = path.join(__dirname, 'db')

const { USER: DB_USER, PASSWORD: DB_PASSWORD, NAME: DB_NAME } = process.env

if (!DB_USER || !DB_PASSWORD || !DB_NAME) {
  console.error('Environment variables missing.')
  process.exit(1)
}

if (!fs.existsSync(db)) {
  fs.mkdirSync(db)
}

async function initBackup() {
  const file = path.join(db, `${DB_NAME}_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.sql`)
  const command = `mariadb-dump -u ${DB_USER} -p${DB_PASSWORD} ${DB_NAME} > ${file}`

  try {
    exec(command, { shell: true }, (error, stdout, stderr) => {
      if (error) {
        throw new Error(`Backup failed: ${stderr || stdout}`)
      }
      console.log(`Backup created successfully: ${file}`)
    });
  } catch (error) {
    console.error('Error taking backup:', error.message);
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

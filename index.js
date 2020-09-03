require('dotenv').config()
const Discord = require('discord.js')
const bot = new Discord.Client()
const net = require('net')
const sql = require('mssql')

const TOKEN = process.env.AUTH_TOKEN
const SERVERS = process.env.SERVERS
const SERVER_NAMES = process.env.SERVER_NAMES

bot.login(TOKEN)

bot.on('ready', async (client) => {
	console.info(`Successfully attached to Discord as: ${bot.user.tag}`)

	try {
		// make sure that any items are correctly URL encoded in the connection string
		await sql.connect(`mssql://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@${process.env.DB_HOSTNAME}/${process.env.DB_DATABASE}`)

		//check for server wide messages every 30 seconds
		setInterval(async () => {
			const result = await sql.query`select msg_id, server, message from server_messages where isnull(sent_discord,0) = 0`

			for (const rs of result.recordset) {
				try {
					let status = new Discord.MessageEmbed().setTitle('Server wide Notification')
					status.setDescription(rs.message)

					let channel = bot.channels.cache.find((ch) => ch.name === rs.server)

					channel.send(status)

					//if successful, we need to update a flag in the db so we know not to run it again
					await sql.query`update server_messages set sent_discord = 1 where msg_id = ${rs.msg_id}`

				} catch (err) {
					console.log("error sending server wide message", err)
				}

			}
		}, 5000)
	} catch (err) {
		console.log(err)
		// ... error checks
	}
})

bot.on('message', async (msg) => {
	if (msg.content === '!ping') {
		msg.channel.send('pong')
	}

	if (msg.content === '!status') {
		//if status is other than good, turn it red
		let servers = SERVERS.split(',')
		let server_names = SERVER_NAMES.split(',')

		for (const [i, value] of servers.entries()) {
			let name = server_names[i]
			let status = new Discord.MessageEmbed().setTitle(name)

			status.setColor('RED')
			status.setDescription('Server is down')
			try {
				let server = value.split(':')
				let s = await pingServer(server[0], server[1])

				if (s) {
					status.setColor('GREEN')
					status.setDescription('Server is Up')
				}
			} catch (err) {}

			msg.channel.send(status)
		}
	}
})

function pingServer(hostname, port) {
	return new Promise((resolve, reject) => {
		const client = new net.Socket()

		try {
			client.connect(port, hostname, () => {
				client.end()
				return resolve(true)
			})

			const onError = () => {
				client.destroy()
				reject(new Error('error'))
			}

			client.once('error', onError)
			client.once('timeout', onError)
		} catch (err) {
			return reject(new Error('error'))
		}
	})
}


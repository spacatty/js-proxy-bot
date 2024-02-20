const fs = require('fs')
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, ".env") })
const { Telegraf } = require('telegraf');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const startMessage = `Приветственное сообщение`

const bot = new Telegraf(process.env.TOKEN, { polling: true });


let group = process.env.GROUP

let blackList = fs.readFileSync(path.join(__dirname, '.blackList'), 'utf8').split`\r\n`

const defineUserId = (msg_id) => fs.readFileSync(path.join(__dirname, '.sentMessages'), 'utf-8').split('\r\n').filter(x => x.split`|`[2] == msg_id)[0].split`|`[0] ?? null

const logSentMessage = (user_notification_message_id, forwarded_message_id, user_id, region_chat_id) => {
    try {
        let messagesData = fs.readFileSync(path.join(__dirname, '.sentMessages'), 'utf-8').split('\r\n')
        messagesData.push(`${user_id}|${user_notification_message_id}|${forwarded_message_id}|${region_chat_id}`)
        fs.writeFileSync(path.join(__dirname, '.sentMessages'), messagesData.join`\r\n`)

    } catch (error) { console.log({ "logSentMessage": error }); }
}

const deleteBannedMessages = (user_id) => {
    try {
        let messagesData = fs.readFileSync(path.join(__dirname, '.sentMessages'), 'utf-8').split('\r\n')
        let filteredUsers = messagesData.filter(x => x.split`|`[0] == user_id)
        for (const item of filteredUsers) {
            let split = item.split`|`
            // delete notification message
            bot.telegram.deleteMessage(split[3], split[2])
            // delete forward message
            bot.telegram.deleteMessage(split[3], split[1])
        }
        let filteredUsersSet = new Set(filteredUsers)
        messagesData = messagesData.filter((x) => { !filteredUsersSet.has(x) })
        fs.writeFileSync(path.join(__dirname, '.sentMessages'), messagesData.join`\r\n`)

    } catch (error) { console.log({ "logSentMessage": error }); }
}


bot.start(msg => {
    if (msg.message.chat.id.toString() !== group) {
        bot.telegram.sendMessage(msg.chat.id, startMessage, { parse_mode: 'Markdown' })
    }
})


const banOrSendMessageToUser = (msg, bot, replyTo) => {
    try {
        if (msg.message.text.includes('/ban')) {
            if (blackList.find(x => x == replyTo) === undefined) {
                fs.appendFileSync('.blackList', '\r\n' + replyTo);
                blackList.push(replyTo)
                fs.writeFileSync(path.join(__dirname, '.blackList'), blackList.join`\r\n`)
                bot.telegram.sendMessage(replyTo, `Вы были заблокированы.`)
                deleteBannedMessages(replyTo)
            }
        } else {
            bot.telegram.sendMessage(replyTo, `${msg.message.text}`)
        }
    } catch (e) {
        console.log({ "banOrSendMessageToUser": e });
    }
}

const processGroupMessage = (bot, msg) => {
    try {
        if (msg.message.reply_to_message.text.match(/USER: #id(.*?)$/)) {
            banOrSendMessageToUser(msg, bot, msg.message.reply_to_message.text.match(/USER: #id(.*?)$/)[1])
        } else {
            let actualUserId = defineUserId(msg.message.reply_to_message.message_id)
            actualUserId ? banOrSendMessageToUser(msg, bot, actualUserId) : 0
        }
    } catch (_) {
        try {
            let actualUserId = defineUserId(msg.message.reply_to_message.message_id)
            actualUserId ? banOrSendMessageToUser(msg, bot, actualUserId) : 0
        } catch (e) { console.log({ "processGroupMessage": e }); }
    }
}

const processUserMessage = (bot, msg) => {
    try {
        let user_notification_message_id, forwarded_message_id;
        (async () => {
            try {
                let temp = await bot.telegram.sendMessage(group, `USER: #id${msg.message.from.id}`)
                user_notification_message_id = temp.message_id
                await sleep(1000)
                temp = await bot.telegram.forwardMessage(group, msg.message.from.id, msg.message.message_id)
                forwarded_message_id = temp.message_id
                logSentMessage(user_notification_message_id, forwarded_message_id, msg.message.chat.id, group)
            } catch (asyncERR) {
                console.log({ "processUserMessageErrorAsyncPart": asyncERR });
            }
        })()
    } catch (e) { console.log({ "processUserMessageError": e }); }
}

bot.on('message', (msg) => {
    try {
        if (blackList.find(x => x == msg.message.chat.id) !== undefined) {
            bot.telegram.sendMessage(msg.message.chat.id, `Вы были заблокированы.`)
        } else {
            if (msg.message.chat.id.toString() == group) {
                processGroupMessage(bot, msg)
            } else {
                processUserMessage(bot, msg)
            }
        }
    } catch (genErr) { console.log({ "genErr": genErr }) }

});


bot.launch();

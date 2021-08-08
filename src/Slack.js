const { IncomingWebhook } = require('@slack/webhook');

class Slack {
    constructor(cfg) {
        this.slack = new IncomingWebhook(cfg.webhookUrl);
        this.channels = cfg.channels;
    }

    send(header, body, channel) {
        let text;
        if (body) {
            text = `*${header}:*\n\`\`\`${JSON.stringify(body)}\`\`\``;
        } else {
            text = header;
        }

        return (async () => {
            console.log(`send to slack: ${text}`);
            await this.slack.send({ text: text, channel: channel });
        })()
            .then(() => {
                console.log("Slack notification has been successfully sent");
            })
            .catch(function (e) {
                console.error(`Couldn't send notification to slack , error : ${e}`);
            });
    }

    alert(header, body) {
        this.send(header, body, this.channels.alerts);
    }

    warn(header, body) {
        this.send(header, body, this.channels.warnings);
    }
}

module.exports = Slack;

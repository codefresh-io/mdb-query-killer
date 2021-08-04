const SlackWebhook = require('slack-webhook');

class Slack {
    constructor(cfg) {
        this.slack = new SlackWebhook(cfg.webhookUrl);
        this.channels = cfg.channels;
    }

    send(header, body, channel) {
        let text;
        if (body) {
            text = `*${header}:*\n\`\`\`${JSON.stringify(body)}\`\`\``;
        } else {
            text = header;
        }

        return this.slack.send({ text: text, channel: channel })
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

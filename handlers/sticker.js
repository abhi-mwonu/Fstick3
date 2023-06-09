const Markup = require('telegraf/markup')
const { addSticker, addStickerText } = require('../utils')

module.exports = async (ctx) => {
  ctx.replyWithChatAction('upload_document').catch(() => {})

  let messageText = ''
  let replyMarkup = {}

  if (!ctx.session.userInfo) ctx.session.userInfo = await ctx.db.User.getData(ctx.from)

  if (!ctx.session.userInfo.stickerSet) {
    return ctx.replyWithHTML(ctx.i18n.t('sticker.add.error.no_selected_pack'), {
      reply_to_message_id: ctx.message.message_id,
      allow_sending_without_reply: true
    })
  }

  let stickerFile, stickerSet
  const stickerType = ctx.updateSubTypes[0]

  switch (stickerType) {
    case 'sticker':
      stickerFile = ctx.message.sticker
      break

    case 'document':
      if (
        (ctx.message?.document?.mime_type.match('image') ||
        ctx.message?.document?.mime_type?.match('video'))
        && !ctx.message.document.mime_type.match(/heic|heif/)
      ) {
        stickerFile = ctx.message.document
        if (ctx.message.caption) stickerFile.emoji = ctx.message.caption
      }
      break

    case 'animation':
      // if caption tenor gif
      if (ctx.message.caption && ctx.message.caption.match('tenor.com')) {
        stickerFile = ctx.message.animation
        stickerFile.fileUrl = ctx.message.caption
      } else {
        stickerFile = ctx.message.animation
        if (ctx.message.caption) stickerFile.emoji = ctx.message.caption
      }
      break

    case 'video':
      stickerFile = ctx.message.video
      if (ctx.message.caption) stickerFile.emoji = ctx.message.caption
      break

    case 'video_note':
        stickerFile = ctx.message.video_note
        stickerFile.video_note = true
    break

    case 'photo':
      // eslint-disable-next-line prefer-destructuring
      stickerFile = ctx.message.photo.slice(-1)[0]
      if (ctx.message.caption) stickerFile.emoji = ctx.message.caption
      break

    default:
      break
  }

  if (stickerType === 'text') {
    const customEmoji = ctx.message.entities.find((e) => e.type === 'custom_emoji')

    if (!customEmoji) return

    const emojiStickers = await ctx.telegram.callApi('getCustomEmojiStickers', {
      custom_emoji_ids: [customEmoji.custom_emoji_id]
    })

    if (!emojiStickers) return

    stickerFile = emojiStickers[0]
  }

  if (ctx.session.userInfo.stickerSet.inline) {
    if (stickerType === 'photo') stickerFile = ctx.message[stickerType].pop()
    else stickerFile = ctx.message[stickerType]
    stickerFile.stickerType = stickerType
    if (ctx.message.caption) stickerFile.caption = ctx.message.caption
    stickerFile.file_unique_id = ctx.session.userInfo.stickerSet.id + '_' + stickerFile.file_unique_id
  }

  if (stickerFile) {
    stickerSet = ctx.session.userInfo.stickerSet
    if (ctx.message.caption?.includes('roundit')) stickerFile.video_note = true
    if (ctx.message.caption?.includes('cropit')) stickerFile.forceCrop = true
    if (ctx.message.photo && ctx.message.caption?.includes('rmbg')) stickerFile.removeBg = true

    const originalSticker = await ctx.db.Sticker.findOne({
      stickerSet,
      fileUniqueId: stickerFile.file_unique_id,
      deleted: false
    })

    let sticker

    if (originalSticker) {
      sticker = originalSticker
    } else {
      sticker = await ctx.db.Sticker.findOne({
        stickerSet,
        'file.file_unique_id': stickerFile.file_unique_id,
        deleted: false
      })
    }

    if (sticker) {
      ctx.session.previousSticker = {
        id: sticker.id
      }

      await ctx.replyWithHTML(ctx.i18n.t('sticker.add.error.have_already'), {
        reply_to_message_id: ctx.message.message_id,
        allow_sending_without_reply: true,
        reply_markup: Markup.inlineKeyboard([
          Markup.callbackButton(ctx.i18n.t('callback.sticker.btn.delete'), `delete_sticker:${sticker.info.file_unique_id}`),
          Markup.callbackButton(ctx.i18n.t('callback.sticker.btn.copy'), `restore_sticker:${sticker.info.file_unique_id}`)
        ])
      })
    } else {
      ctx.session.previousSticker = null

      const stickerInfo = await addSticker(ctx, stickerFile)

      if (stickerInfo.wait) {
        return
      }

      const result = addStickerText(stickerInfo, ctx.i18n.locale())

      messageText = result.messageText
      replyMarkup = result.replyMarkup

      // if (typeof stickerSet?.publishDate === 'undefined' && !stickerSet?.animated && !stickerSet?.inline) {
      //   const countStickers = await ctx.db.Sticker.count({
      //     stickerSet,
      //     deleted: false
      //   })

      //   if ([15, 50, 80, 120].includes(countStickers)) {
      //     setTimeout(async () => {
      //       await ctx.replyWithHTML(ctx.i18n.t('sticker.add.catalog_offer', {
      //         title: escapeHTML(stickerSet.title),
      //         link: `${ctx.config.stickerLinkPrefix}${stickerSet.name}`
      //       }), {
      //         reply_markup: Markup.inlineKeyboard([
      //           Markup.callbackButton(ctx.i18n.t('callback.pack.btn.catalog_add'), `catalog:publish:${stickerSet.id}`)
      //         ])
      //       })
      //     }, 1000 * 2)
      //   }
      // }
    }
  } else {
    messageText = ctx.i18n.t('sticker.add.error.file_type.unknown')
  }

  if (messageText) {
    await ctx.replyWithHTML(messageText, {
      reply_to_message_id: ctx.message.message_id,
      allow_sending_without_reply: true,
      reply_markup: replyMarkup
    })
  }
}

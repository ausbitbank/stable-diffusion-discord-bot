# Discord bot commands

This is not a complete guide yet.

For more advanced prompt syntax for the invokeai backend see this https://invoke-ai.github.io/InvokeAI/features/PROMPTS/

`/dream` or `!dream prompt` to create images

 An example request with most options used manually

`!dream a redneck Vitalik+ man wearing a tank top, sunglasses, drinking beer, doing a thumbs up gesture, dancing, laughing at his house being on fire, high quality, detailed, a beautiful retrowave artwork, trending on artstation withLora(vitalik,0.8) withLora(add_detail,1.2) [<neg-sketch-2>] --width 697 --height 929 --steps 30 --seed 951987030 --scale 7 --sampler ddim --model degenerate526urpm --hires_fix --upscale_level 2 --upscale_strength 0.5 --gfpgan_strength 0.5`

Simply using `!dream` on its own will generate a random image with the default settings

You can also just @ mention the bot in place of the `!dream` command.

`/help` or `!help` to show arty github and intro post with usage information

`/random` will render a random prompt

`/recharge` or `!recharge` show credit recharge information

`/text` or `!text your text` and attach image to add text overlays to an image for instant memes (alt: !textTopLeft/Top/TopRight/Left/Centre/Right/BottomLeft/Bottom/BottomRight)

`/models/` or `!models` show all the currently installed diffusion models

`/embeds` or `!embeds` show all the installed Textual Inversions and LORA's with usage instructions

`!background` and attach image to remove background

`!avatar @username`  display full size discord avatars of all mentioned usernames

`!crop` and attach image to automatically remove tranparent pixels

`!expand` and attach image to expand the image with transparency (expandsides/expanddown/expandup/expandleft/expandright also available)

`!fade` and attach image to apply gradient transparency to edges
(fadeleft/faderight/fadeup/fadedown also available)

`!metadata` extract exif metadata from an attached image

`!lexica prompt or image url` Displays some results from lexica.art for your query, can analyse image urls and show prompts with a similar style

`!imgdiff` and attach 2 images to show the visual difference

`!randomisers` shows all of the available text files in the \txt\ directory

`!meme animate` attach images to animate them together
`!meme blink` same as above

`!meme blur` attach image to blur 10%

`!meme greyscale` attach image to make it greyscale

`!meme invert` attach image to invert colors

`!meme flip` attach image to flip vertically

`!meme mirror` attach image to flip horizontally

`!meme rotate [degrees]` attach image to rotate, 90 degree default if no degrees are added

`!gift 1 @user` to gift your paid credit balance beyond 100 to another user. Mention multiple people to send the same amount to each

`!meme animateseed 123` (animate images with a specific seed, add prompt text to image, bugged on certain prompts)

`!split columns rows` and attach image, to split the image into sections (broken, WIP)

# When replying to a render:

`.. ` 2 dots and a space will allow you to modify an existing render, follow it with additions to the prompt or !dream parameters  . All other settings from the render you reply to will be kept, except for hires_fix and upscaling options.

`inpaint prompt` will use the replied image as a template, use the inpainting model and inpaint your prompt. If the image has transparencies, those will be filled. If it does not, use the `--mask face` to automatically select areas matching your search (face) and replace them with your prompt. If width and height are not set, they will automatically match the input image.

`template prompt` will take the image you reply to, set it as a template and set the matching width/height . You can follow your prompt with any of the usual settings from !dream .  If width and height are not set, they will automatically match the input image.

`seed` replies with an easy to copy seed number

`info` replies with the full !dream command to recreate the image you reply to

`samplers ddim plms` will rerun the render using whatever samplers you choose, 1 by 1

`models model1 model2` will rerun the render with whatever model names you give it

`embeds search1 search 2` will search all the textual inversions and LORA's for your search terms, and test them all 1 by 1.

# Using emoji's on a render:

If anyone adds positive emojis (😂👍⭐❤️) to a render result, it will be copied over to the servers Star gallery channel (if configured in dbGalleryChannels.json)

If someone adds an envelope ✉️ emoji it will be DM'd to them

If the creator or bot admin adds a 🙈 / `:see_no_evil:` it will move the render to the servers NSFW channel (if configured in dbNFSWChannels.json)

If the creator or bot admin adds a negative emoji (👎⚠️❌💩) it will be deleted

# admin only commands

`!wipequeue` the nuclear option, delete the full job queue (old and new) and start fresh
`!queue` shows queue status
`!cancel` sends cancel command to invokeai backend (WIP, buggy)

`!pause` sets bot status to DND, if queue is empty new jobs will not trigger till unpaused
`!unpause`

`!checkpayments` triggers an immediate check for new payments to hive account

`!restart` quits the bot process, trigger an automatic restart

`!credit 123 @username @user2` manually give credits to mentioned accounts

`!say channelid message here`  broadcasts a message as arty to channelid

`!guilds` dumps the current guild/server information to console log
`!leaveguild guildid` exit a specific guild id

`!updateslashcommands` triggers a manual update of the application slash commands
`!deleteslashcommands` manually deletes slash commands (to be used with above)

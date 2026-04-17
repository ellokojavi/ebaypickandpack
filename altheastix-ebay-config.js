// Configuration file for Altheastix Tampermonkey Script
// Hosts: Message Templates, Quotes, Keywords, and Delivery Notes.
window.AltheastixConfig = {
    // Delivery note blurbs used inside the templates
    deliveryNotes: {
        canada: 'Orders to Canada may take several weeks to arrive, so please be patient.',
        usualPlural: 'They usually arrive within 5–7 business days',
        usualSingular: 'It usually arrives within 5–7 business days',
        patienceVariants: [
            'although USPS can sometimes take a bit longer—thanks for your patience.',
            'but USPS may occasionally take more time to deliver, so please be patient.',
            'though USPS timing can vary at times—thanks for bearing with it.',
            'although occasional USPS delays do happen—thank you for your patience.',
            'but USPS can run slow sometimes; thanks for your patience.'
        ]
    },

    // Centralized message templates
    messageTemplates: {
        thankYouDrafts: [
            `Hooray, {BUYER_FIRST}! Your Altheastix order is on its way. We're shipping your {STICKER_WORD} on {SHIP_DATE} via USPS. {DELIVERY_NOTE} If it takes more time than expected, it could just be a matter of time because sometimes USPS works in quite mysterious ways.\n\n{TRACKING_NOTE}\n\nGot questions or just want to say hi? We're always here to help. Enjoy {DEMONSTRATIVE} {STICKER_WORD}!\n\nThe Altheastix Team`,
            `Hi {BUYER_FIRST}, great news! your Altheastix {STICKER_WORD} order is queued to go out on {SHIP_DATE} via USPS. {DELIVERY_NOTE}\n\n{TRACKING_NOTE}\n\nIf anything seems off, or you just want to share feedback, reply anytime. Enjoy the new {STICKER_WORD}!\n\n-- The Altheastix Crew`,
            `{BUYER_FIRST}, your {STICKER_WORD} will be mailed on {SHIP_DATE} through USPS. {DELIVERY_NOTE}\n\n{TRACKING_NOTE}\n\nAppreciate your support! Reach out if you need anything. Hope the designs brighten your day.\n\nAltheastix`,
            `Hey {BUYER_FIRST}! Quick heads-up: your Altheastix envelope (with your {STICKER_WORD}) joins the mail stream on {SHIP_DATE}. {DELIVERY_NOTE}\n\n{TRACKING_NOTE}\n\nPing us any time if something feels slow or you just want to chat. Thanks again for supporting our little shop!\n\n-- Team Altheastix`,
            `Hello {BUYER_FIRST}! Your {STICKER_WORD} will ship on {SHIP_DATE}. {DELIVERY_NOTE}\n\n{TRACKING_NOTE}\n\nHope these designs bring some spark. Message us if you need anything at all.\n\nAltheastix`,
            `Woohoo, {BUYER_FIRST}! Thanks for your order. We're mailing {DEMONSTRATIVE} {STICKER_WORD} on {SHIP_DATE}. {DELIVERY_NOTE}\n\n{TRACKING_NOTE}\n\nThanks for being awesome and supporting our shop!`,
            `Big thanks, {BUYER_FIRST}! Your Altheastix {STICKER_WORD} head out on {SHIP_DATE}. {DELIVERY_NOTE}\n\n{TRACKING_NOTE}\n\nWe appreciate you. Enjoy {DEMONSTRATIVE} {STICKER_WORD}!`,
            `Yay, {BUYER_FIRST}! Shipping day for your {STICKER_WORD} is {SHIP_DATE}. {DELIVERY_NOTE}\n\n{TRACKING_NOTE}\n\nThanks again for choosing Altheastix. Can't wait for {PRONOUN_OBJ} to arrive!`,
            `Hey {BUYER_FIRST}, high-five! {DEMONSTRATIVE} {STICKER_WORD} will be on the way by {SHIP_DATE}. {DELIVERY_NOTE}\n\n{TRACKING_NOTE}\n\nHope these add a burst of joy to your day!`,
            `You rock, {BUYER_FIRST}! We'll drop {DEMONSTRATIVE} {STICKER_WORD} in the mail on {SHIP_DATE}. {DELIVERY_NOTE}\n\n{TRACKING_NOTE}\n\nThanks for supporting our small business -- enjoy!`,
            `Just a friendly update, {BUYER_FIRST}! Your {STICKER_WORD} are scheduled for shipment on {SHIP_DATE}. {DELIVERY_NOTE}\n\n{TRACKING_NOTE}\n\nWe're excited for you to receive them. Let us know if you have any questions!`,
            `Get ready, {BUYER_FIRST}! Your Altheastix order containing {STICKER_WORD} is being dispatched on {SHIP_DATE}. {DELIVERY_NOTE}\n\n{TRACKING_NOTE}\n\nThank you for your purchase. We hope you love your new items!`,
            `Good news, {BUYER_FIRST}! Your {STICKER_WORD} will be heading your way on {SHIP_DATE}. {DELIVERY_NOTE}\n\n{TRACKING_NOTE}\n\nYour support means a lot to us. Enjoy!`,
            `Hello {BUYER_FIRST}, your order is confirmed! We will ship your {STICKER_WORD} on {SHIP_DATE}. {DELIVERY_NOTE}\n\n{TRACKING_NOTE}\n\nWe appreciate your business and hope to see you again soon.`,
            `Thanks for your order, {BUYER_FIRST}! Your {STICKER_WORD} are set to ship on {SHIP_DATE}. {DELIVERY_NOTE}\n\n{TRACKING_NOTE}\n\nWe're so glad you chose Altheastix. Enjoy your new goodies!`,
            `Your Altheastix package is almost ready, {BUYER_FIRST}! We're shipping {DEMONSTRATIVE} {STICKER_WORD} on {SHIP_DATE}. {DELIVERY_NOTE}\n\n{TRACKING_NOTE}\n\nThanks for shopping with us!`,
            `Hi {BUYER_FIRST}, we're preparing your order of {STICKER_WORD} for shipment on {SHIP_DATE}. {DELIVERY_NOTE}\n\n{TRACKING_NOTE}\n\nWe can't wait for you to get them. Thanks again!`,
            `Exciting news, {BUYER_FIRST}! Your {STICKER_WORD} will be dispatched on {SHIP_DATE}. {DELIVERY_NOTE}\n\n{TRACKING_NOTE}\n\nWe hope they bring a smile to your face. Enjoy!`,
            `Hey {BUYER_FIRST}, your order is on its way! We're sending out your {STICKER_WORD} on {SHIP_DATE}. {DELIVERY_NOTE}\n\n{TRACKING_NOTE}\n\nThank you for choosing our shop. We appreciate you!`,
            `Your order is packed and ready, {BUYER_FIRST}! Look for your {STICKER_WORD} to ship on {SHIP_DATE}. {DELIVERY_NOTE}\n\n{TRACKING_NOTE}\n\nThanks for your support. Come back soon!`
        ]
    },

    // Quotes Library
    quotes: {
        "Grateful Dead": [
            `Constantly choosing the lesser of two evils is still choosing evil.\n— Jerry Garcia`,
            `You need music, I don't know why. It's probably one of those Joe Campbell questions, why we need ritual. We need magic, and bliss, and power, myth, and celebration and religion in our lives, and music is a good way to encapsulate a lot of it.\n— Jerry Garcia`,
            `We're like licorice. Not everybody likes licorice, but the people who like licorice really like licorice.\n— Jerry Garcia`,
            `What we're thinking about is a peaceful planet. We're not thinking about anything else.\n— Jerry Garcia`,
            `The same song on a different day was a different song.\n— Bob Weir`,
            `What I like best about music is when time goes away.\n— Bob Weir`,
            `Bicycles are almost as good as guitars for meeting girls.\n— Bob Weir`,
            `If you had started doing anything two weeks ago, by today you would have been two weeks better at it.\n— John Mayer`,
            `Someday, everything will make perfect sense. So for now, laugh at the confusion, smile through the tears, be strong and keep reminding yourself that everything happens for a reason.\n— John Mayer`,
            `It's very liberating when you finally realize it's impossible to make everyone like you.\n— John Mayer`
        ],
        "Jimi Hendrix": [
            `Knowledge speaks, but wisdom listens.\n— Jimi Hendrix`,
            `Imagination is the key to my lyrics. The rest is painted with a little science fiction.\n— Jimi Hendrix`,
            `Sometimes you want to give up the guitar, you'll hate the guitar. But if you stick with it, you're going to be rewarded.\n— Jimi Hendrix`,
            `Music is my religion.\n— Jimi Hendrix`,
            `Excuse me while I kiss the sky.\n— Jimi Hendrix`,
            `I'm the one that's got to die when it's time for me to die, so let me live my life the way I want to.\n— Jimi Hendrix`,
            `When the power of love overcomes the love of power, the world will know peace.\n— Jimi Hendrix`,
            `Music doesn't lie. If there is something to be changed in this world, then it can only happen through music.\n— Jimi Hendrix`,
            `I've been imitated so well I've heard people copy my mistakes.\n— Jimi Hendrix`,
            `The story of life is quicker than the wink of an eye, the story of love is hello and goodbye...until we meet again.\n— Jimi Hendrix`
        ],
        "Van Halen": [
            `To hell with the rules. If it sounds right, then it is.\n— Eddie Van Halen`,
            `Music kept me off the streets and out of trouble and gave me something that was mine that no one could take away from me.\n— Eddie Van Halen`,
            `A guitar is a very personal extension of the person playing it. You have to be emotionally and spiritually connected to your instrument.\n— Eddie Van Halen`,
            `Rock and roll is a misnomer. It should be rock and roll and swing.\n— Eddie Van Halen`,
            `It's always about the music, never about anything else.\n— Eddie Van Halen`,
            `If you want to be a rock star or just be famous, then run down the street naked, you'll make the news or something. But if you want to be a musician, then practice, practice, practice.\n— Eddie Van Halen`,
            `The name Van Halen, the family legacy, is going to go on long after I'm gone.\n— Eddie Van Halen`,
            `I'm just a normal schmo like everyone else.\n— Eddie Van Halen`,
            `It's gotta be in the blood, I think.\n— Eddie Van Halen`,
            `When I'm home on a break, I lock myself in my room and play guitar. After two or three hours, I start getting into this emotional thing. I start visualizing myself onstage, playing the guitar, and it gets so intense that I'm sweating!\n— Eddie Van Halen`
        ],
        "Led Zeppelin": [
            `Without deviation from the norm, progress is not possible.\n— Frank Zappa`,
            `Music is the one thing that has been consistently here for me. It hasn't let me down.\n— Jimmy Page`,
            `I believe every guitar player inherently has something unique about their playing. They just have to identify what makes them different and develop it.\n— Jimmy Page`,
            `The whole idea of music is to be able to play what you think.\n— Robert Plant`,
            `There's nothing worse than a bunch of jaded old farts, and that's a fact.\n— Robert Plant`,
            `A mind is like a parachute. It doesn't work if it is not open.\n— Frank Zappa`,
            `The most important thing in art is the frame. For painting: literally; for other arts: figuratively—because, without this humble appliance, you can't know where The Art stops and The Real World begins.\n— Frank Zappa`,
            `I just want to play guitar and be in a band.\n— Jimmy Page`,
            `I'm a Zeppelin fan, but I'm a Zeppelin fan of the first three records.\n— Robert Plant`,
            `Information is not knowledge. Knowledge is not wisdom. Wisdom is not truth. Truth is not beauty. Beauty is not love. Love is not music. Music is THE BEST.\n— Frank Zappa`
        ],
        "Rolling Stones": [
            `Anything worth doing is worth overdoing.\n— Mick Jagger`,
            `It's all right letting yourself go, as long as you can get yourself back.\n— Mick Jagger`,
            `Lose your dreams and you might lose your mind.\n— Mick Jagger`,
            `The past is a great place and I don't want to erase it or to regret it, but I don't want to be its prisoner either.\n— Mick Jagger`,
            `Good music comes out of people playing together.\n— Keith Richards`,
            `If you don't know the blues, there's no point in picking up the guitar.\n— Keith Richards`,
            `If you don't know the blues... there's no point in picking up the guitar and playing rock and roll or any other form of popular music.\n— Keith Richards`,
            `Everyone talks about rock these days; the problem is they forget about the roll.\n— Keith Richards`,
            `I'd rather be a legend than a star.\n— Mick Jagger`,
            `Music is a language that doesn't speak in particular words. It speaks in emotions, and if it's in the bones, it's in the bones.\n— Keith Richards`
        ],
        "The Beatles": [
            `You may say I'm a dreamer, but I'm not the only one.\n— John Lennon`,
            `Life is what happens when you're making other plans.\n— John Lennon`,
            `A dream you dream alone is only a dream. A dream you dream together is reality.\n— John Lennon`,
            `You don't need anybody to tell you who you are or what you are. You are what you are!\n— John Lennon`,
            `There's nothing you can do that can't be done.\n— John Lennon`,
            `Reality leaves a lot to the imagination.\n— John Lennon`,
            `If someone thinks that love and peace is a cliché that must have been left behind in the Sixties, that's his problem. Love and peace are eternal.\n— John Lennon`,
            `I believe in everything until it's disproved. So I believe in fairies, the myths, dragons. It all exists, even if it's in your mind. Who's to say that dreams and nightmares aren't as real as the here and now?\n— John Lennon`,
            `It matters not who you love, where you love, why you love, when you love or how you love, it matters only that you love.\n— John Lennon`,
            `There are two basic motivating forces: fear and love. When we are afraid, we pull back from life. When we are in love, we open to all that life has to offer with passion, excitement, and acceptance.\n— John Lennon`
        ],
        "David Bowie": [
            `I don't know where I'm going from here, but I promise it won't be boring.\n— David Bowie`,
            `Tomorrow belongs to those who can hear it.\n— David Bowie`,
            `I'm an instant star. Just add water and stir.\n— David Bowie`,
            `I always had a repulsive need to be something more than human.\n— David Bowie`,
            `The truth is of course is that there is no journey. We are arriving and departing all at the same time.\n— David Bowie`,
            `I'm not a prophet or a stone aged man, just a mortal with potential of a superman. I'm living on.\n— David Bowie`,
            `I've always been a very curious person.\n— David Bowie`,
            `I'm just an individual who doesn't feel that I need to have somebody else define my life. I'll take the responsibility for being who I am.\n— David Bowie`,
            `I find only freedom in the realms of eccentricity.\n— David Bowie`,
            `Make the best of every moment. We're not evolving. We're not going anywhere.\n— David Bowie`
        ],
        "Nirvana": [
            `I'd rather be hated for who I am, than loved for who I am not.\n— Kurt Cobain`,
            `Wanting to be someone else is a waste of the person you are.\n— Kurt Cobain`,
            `The duty of youth is to challenge corruption.\n— Kurt Cobain`,
            `I'm so happy because today I found my friends - they're in my head.\n— Kurt Cobain`,
            `If you're a really mean person you're going to come back as a fly and eat poop.\n— Kurt Cobain`,
            `I am not gay, although I wish I were, just to piss off homophobes.\n— Kurt Cobain`,
            `Practice makes perfect, but nobody's perfect, so why practice?\n— Kurt Cobain`,
            `I'm a much happier guy than a lot of people think I am.\n— Kurt Cobain`,
            `I just hope I don't become so blissful I become boring. I think I'll always be neurotic enough to do something weird.\n— Kurt Cobain`,
            `I would like to get rid of the homophobes, sexists, and racists in our audience. I know they're out there and it really bothers me.\n— Kurt Cobain`
        ],
        "Prince": [
            `The most important thing is to be true to yourself.\n— Prince`,
            `A strong spirit transcends rules.\n— Prince`,
            `Despite everything, no one can dictate who you are to other people.\n— Prince`,
            `I'm not a woman. I'm not a man. I am something that you'll never understand.\n— Prince`,
            `Dearly beloved, we are gathered here today to get through this thing called life.\n— Prince`,
            `Sometimes it snows in April.\n— Prince`,
            `I've always understood the two to be intertwined: sexuality and spirituality. That never changed.\n— Prince`,
            `There's always a rainbow at the end of every rain.\n— Prince`,
            `Compassion is an action word with no boundaries.\n— Prince`,
            `Art is about building a new foundation, not just laying something on top of what's already there.\n— Prince`
        ],
        "Bob Marley": [
            `One good thing about music, when it hits you, you feel no pain.\n— Bob Marley`,
            `Love the life you live. Live the life you love.\n— Bob Marley`,
            `The truth is, everyone is going to hurt you. You just got to find the ones worth suffering for.\n— Bob Marley`,
            `Don't gain the world and lose your soul, wisdom is better than silver or gold.\n— Bob Marley`,
            `The greatness of a man is not in how much wealth he acquires, but in his integrity and his ability to affect those around him positively.\n— Bob Marley`,
            `Some people feel the rain. Others just get wet.\n— Bob Marley`,
            `Emancipate yourselves from mental slavery, none but ourselves can free our minds.\n— Bob Marley`,
            `Live for yourself and you will live in vain; live for others, and you will live again.\n— Bob Marley`,
            `The day you stop racing is the day you win the race.\n— Bob Marley`,
            `Don't worry about a thing, 'cause every little thing gonna be all right.\n— Bob Marley`
        ],
        "Bob Dylan": [
            `A hero is someone who understands the responsibility that comes with his freedom.\n— Bob Dylan`,
            `What's money? A man is a success if he gets up in the morning and goes to bed at night and in between does what he wants to do.\n— Bob Dylan`,
            `I think a hero is any person really intent on making this a better place for all people.\n— Bob Dylan`,
            `All I can do is be me, whoever that is.\n— Bob Dylan`,
            `Some people feel the rain. Others just get wet.\n— Bob Dylan`,
            `He not busy being born is busy dying.\n— Bob Dylan`,
            `I'll let you be in my dreams if I can be in yours.\n— Bob Dylan`,
            `No one is free, even the birds are chained to the sky.\n— Bob Dylan`,
            `Take care of all your memories. For you cannot relive them.\n— Bob Dylan`,
            `Behind every beautiful thing, there's some kind of pain.\n— Bob Dylan`
        ],
        "Elvis Presley": [
            `Truth is like the sun. You can shut it out for a time, but it ain't goin' away.\n— Elvis Presley`,
            `The image is one thing and the human being is another. It's very hard to live up to an image, put it that way.\n— Elvis Presley`,
            `I'm not trying to be sexy. It's just my way of expressing myself when I move around.\n— Elvis Presley`,
            `I don't know anything about music. In my line you don't have to.\n— Elvis Presley`,
            `Rhythm is something you either have or don't have, but when you have it, you have it all over.\n— Elvis Presley`,
            `I never expected to be anybody important.\n— Elvis Presley`,
            `Do something worth remembering.\n— Elvis Presley`,
            `The only thing worse than watching a bad movie is being in one.\n— Elvis Presley`,
            `I've tried to lead a straight, clean life, not set any kind of a bad example.\n— Elvis Presley`,
            `Values are like fingerprints. Nobody's are the same, but you leave 'em all over everything you do.\n— Elvis Presley`
        ],
        "Chuck Berry": [
            `Of the five most important things in life, health is first, education or knowledge is second, and wealth is third. I forget the other two.\n— Chuck Berry`,
            `It's amazing how much you can learn if your intentions are truly earnest.\n— Chuck Berry`,
            `Rock and roll is a back-beat, let's say. It's something that you can dance to, something that you can enjoy.\n— Chuck Berry`,
            `I grew up thinking art was pictures until I got into music and found I was an artist and didn't paint.\n— Chuck Berry`,
            `It's gotta be the going, not the getting there, that's good.\n— Chuck Berry`,
            `Music is an important part of our culture and record stores play a vital part in keeping the power of music alive.\n— Chuck Berry`,
            `You know, the forward memory is just as important as the backward memory.\n— Chuck Berry`,
            `I'm a rock 'n' roller, but I'm a rock 'n' roller with a lot of jazz in me.\n— Chuck Berry`,
            `The beautiful thing about learning is that nobody can take it away from you.\n— Chuck Berry`,
            `Don't let the same dog bite you twice.\n— Chuck Berry`
        ],
        "Queen": [
            `I won't be a rock star. I will be a legend.\n— Freddie Mercury`,
            `The most important thing is to live a fabulous life. As long as it's fabulous I don't care how long it is.\n— Freddie Mercury`,
            `I'm just a musical prostitute, my dear.\n— Freddie Mercury`,
            `I always knew I was a star. And now, the rest of the world seems to agree with me.\n— Freddie Mercury`,
            `We're a very expensive group; we break a lot of rules. It's unheard of to combine opera with rock and roll, and we did it.\n— Freddie Mercury`,
            `I'm not afraid to speak my mind.\n— Freddie Mercury`,
            `You can be anything you want to be, just turn yourself into anything you think that you could ever be.\n— Freddie Mercury`,
            `The bigger the better; in everything.\n— Freddie Mercury`,
            `I'm possessed by love - but isn't everybody?\n— Freddie Mercury`,
            `We are the champions, my friends, and we'll keep on fighting 'til the end.\n— Freddie Mercury`
        ],
        "Ozzy Osbourne": [
            `Of all the things I've lost, I miss my mind the most.\n— Ozzy Osbourne`,
            `Being sober on a bus is, like, totally different than being drunk on a bus.\n— Ozzy Osbourne`,
            `I'm a very simple man. You've got to have, like, a computer nowadays to turn the TV on and off... and the progress button, you know...\n— Ozzy Osbourne`,
            `I love the smell of formaldehyde. I just love it. It's a nice, clean smell.\n— Ozzy Osbourne`,
            `I can't do this anymore. I'm tired of this. I can't live like this. I'm a shadow of my former self.\n— Ozzy Osbourne`,
            `I'm not the kind of person who's going to look at the top of a mountain and go, 'Oh, I'm never going to get there.' I'm going to go, 'I'm going to get there.'\n— Ozzy Osbourne`,
            `I'm just a crazy person. I'm not a musician. I'm not a rock star. I'm just a crazy person.\n— Ozzy Osbourne`,
            `I'm not a satanist. I'm a musician.\n— Ozzy Osbourne`,
            `I'm not a bad guy. I'm just a good guy who's had a bad life.\n— Ozzy Osbourne`,
            `I'm not a role model. I'm a rock star.\n— Ozzy Osbourne`
        ],
        "Rat Fink": [
            `There is no such thing as "too weird."\n— Ed "Big Daddy" Roth`,
            `If it's worth doing, it's worth overdoing.\n— Ed "Big Daddy" Roth`,
            `Hot rodding is an attitude. It's a way of life.\n— Ed "Big Daddy" Roth`,
            `The weirder, the better.\n— Ed "Big Daddy" Roth`,
            `Normal is just a setting on a washing machine.\n— Ed "Big Daddy" Roth`,
            `I never draw anything that's normal.\n— Ed "Big Daddy" Roth`,
            `I'm not an artist. I'm a pinstriper.\n— Ed "Big Daddy" Roth`,
            `I'm not a car builder. I'm a car artist.\n— Ed "Big Daddy" Roth`,
            `I'm not a painter. I'm a creator of monsters.\n— Ed "Big Daddy" Roth`,
            `I'm not a designer. I'm a builder of dreams.\n— Ed "Big Daddy" Roth`
        ],
        "The Simpsons": [
            `D'oh!\n— Homer Simpson`,
            `Everything's coming up Milhouse!\n— Milhouse Van Houten`,
            `I'm not normally a praying man, but if you're up there, please save me, Superman.\n— Homer Simpson`,
            `To alcohol! The cause of, and solution to, all of life's problems.\n— Homer Simpson`,
            `You don't win friends with salad.\n— Homer Simpson`,
            `I am so smart! I am so smart! S-M-R-T! I mean S-M-A-R-T!\n— Homer Simpson`,
            `Just because I don't care doesn't mean I don't understand.\n— Homer Simpson`,
            `Trying is the first step towards failure.\n— Homer Simpson`,
            `Kids, you tried your best and you failed miserably. The lesson is, never try.\n— Homer Simpson`,
            `I'm in no condition to drive...wait! I shouldn't listen to myself, I'm drunk!\n— Homer Simpson`
        ],
        "general": [
            `Musicians don't retire; they stop when there's no more music in them.\n— Louis Armstrong`,
            `Music can change the world because it can change people.\n— Bono`,
            `To live is to be musical, starting with the blood dancing in your veins. Everything living has a rhythm. Do you feel your music?\n— Michael Jackson`,
            `If everything was perfect, you would never learn and you would never grow.\n— Beyoncé`,
            `The only truth is music.\n— Jack Kerouac`,
            `Where words fail, music speaks.\n— Hans Christian Andersen`,
            `To play a wrong note is insignificant; to play without passion is inexcusable.\n— Ludwig van Beethoven`,
            `Music gives a soul to the universe, wings to the mind, flight to the imagination and life to everything.\n— Plato`,
            `If I cannot fly, let me sing.\n— Stephen Sondheim`,
            `Music is the strongest form of magic.\n— Marilyn Manson`
        ],
        "Maradona": [
            `To see the ball, to run after it, makes me the happiest man in the world.\n— Diego Maradona`,
            `When you win, you don't get carried away. But if you go step by step, with confidence, you can go far.\n— Diego Maradona`,
            `I am black or white, I'll never be grey in my life.\n— Diego Maradona`,
            `It was the hand of God.\n— Diego Maradona`,
            `My mother thinks I am the best. And I was raised to always believe what my mother tells me.\n— Diego Maradona`,
            `I am Maradona, who makes goals, who makes mistakes. I can take it all, I have shoulders big enough to fight with everybody.\n— Diego Maradona`,
            `God makes me play well. That is why I always make the sign of the cross when I walk out on to the field. I feel I would be betraying him if I didn't.\n— Diego Maradona`,
            `All the people that criticized me should eat their words.\n— Diego Maradona`,
            `When I wear the national team shirt, its sole contact with my skin makes it stand on an end.\n— Diego Maradona`,
            `If I die, I want to be reborn and I want to be a footballer. And I want to be Diego Armando Maradona again. I am a player who has given people joy and that is enough for me.\n— Diego Maradona`
        ]
    },

    // Keyword mapping for Quotes
    quoteKeywords: {
        "Grateful Dead": ["Grateful Dead", "Jerry Garcia", "Bob Weir", "John Mayer", "Deadhead"],
        "Jimi Hendrix": ["Jimi Hendrix", "Hendrix"],
        "Van Halen": ["Van Halen", "Eddie Van Halen", "EVH"],
        "Led Zeppelin": ["Led Zeppelin", "Jimmy Page", "Robert Plant", "Frank Zappa"],
        "Rolling Stones": ["Rolling Stones", "Mick Jagger", "Keith Richards"],
        "The Beatles": ["The Beatles", "John Lennon"],
        "David Bowie": ["David Bowie"],
        "Nirvana": ["Nirvana", "Kurt Cobain"],
        "Prince": ["Prince"],
        "Bob Marley": ["Bob Marley"],
        "Bob Dylan": ["Bob Dylan"],
        "Elvis Presley": ["Elvis Presley"],
        "Chuck Berry": ["Chuck Berry"],
        "Queen": ["Queen", "Freddie Mercury"],
        "Ozzy Osbourne": ["Ozzy Osbourne"],
        "Rat Fink": ["Rat Fink"],
        "The Simpsons": ["The Simpsons"],
        "Maradona": ["Maradona", "Diego Maradona"]
    }
};

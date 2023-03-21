//
// Variables
//

var cache = {
  //0 is id, 1 is username, 2 is pfp, 3 is bot
  users: [],
  //0 is id, 1 is name, 2 is channel type, 3 is server, 4 is last message
  channels: [],
  categories: [],
  //0 is id, 1 is name, 2 is server icon id, 3 is roles, 4 is members
  servers: [],
  //0 is id, 1 is author, 2 is content
  messages: [],
};

var activeReplies = [];

var activeServer;
var activeChannel;
var token;
var socket;
var userProfile;
var activeRequests = 0;
var currentlyTyping = [];
var mutedChannels = [];
var unreads = [];
var unreadChannels = [];
var cssVars = getComputedStyle(document.querySelector(':root'));

//
// Run on page load
//

window.onload = function () {
  if (!localStorage.getItem("token")) return;
  token = localStorage.getItem("token");
  login();
};

//
// Functions
//

document.addEventListener("keydown", (event) => {
  switch (event.key) {
    case "Enter":
      sendMessage();
      break;
    case "Escape":
      activeReplies.pop();
      document.querySelector(".replying-container").lastChild.remove();
      break;
    default:
      
  }
});

function cacheLookup(resource, ID, serverID = null) {
  if (resource === "members" || resource === "roles") {
    for (let i = 0; i < cache.servers.length; i++) {
      if (cache.servers[i][0] === serverID) {
        const index = resource === "members" ? 4 : 3;
        if (resource === "members") {
          for (let j = 0; j < cache.servers[i][index].length; j++) {
            if (cache.servers[i][index][j]._id.user === ID)
              return cache.servers[i][index][j];
          }
        } else {
          for (const role in cache.servers[i][index]) {
            if (role === ID) return cache.servers[i][index][role];
          }
        }
      }
    }
    return 1;
  }
  for (let i = 0; i < cache[resource].length; i++) {
    if (cache[resource][i][0] === ID) return cache[resource][i];
  }
  return 1;
}

function cacheIndexLookup(resource, ID) {
  for (let i = 0; i < cache[resource].length; i++) {
    if (cache[resource][i][0] === ID) return i;
  }
  return 1;
}

async function fetchResource(target) {
  //Return of false means that it failed
  const res = await fetch(`https://api.revolt.chat/${target}`, {
    headers: {
      "x-session-token": token,
    },
    method: "GET",
  })
    .then((res) => res.json())
    .catch((error) => {
      console.log(error);
      return false;
    });
  return res;
}

//
// Main stuff
//

async function loadSyncSettings() {
  const rawSettings = await fetch("https://api.revolt.chat/sync/settings/fetch", {
    headers: {
      "x-session-token": token,
    },
    body: JSON.stringify({
      keys: ["theme","notifications","ordering"],
    }),
    method: "POST",
  }).then((response) => response.json());
  fetch("https://api.revolt.chat/sync/unreads", {
    headers: {
      "x-session-token": token,
    },
    method: "GET",
  }).then((response) => response.json()).then((data) => {unreads = data});
   

  let theme = JSON.parse(rawSettings.theme[1])["appearance:theme:overrides"];
  let notifications = JSON.parse(rawSettings.notifications[1]);
  Object.keys(notifications.channel).forEach((channel) => {
    if (notifications.channel[channel] === "muted") mutedChannels.push(channel)
  })
  let themeVars = document.querySelector(":root");
  themeVars.style.setProperty("--accent", theme.accent);
  themeVars.style.setProperty("--error", theme.error);
  themeVars.style.setProperty("--servers-bg", theme.background);
  themeVars.style.setProperty("--channels-bg", theme["secondary-background"]);
  themeVars.style.setProperty("--secondary-background", theme["message-box"]);
  themeVars.style.setProperty("--background", theme["primary-background"]);
  themeVars.style.setProperty("--foreground", theme["foreground"]);
  themeVars.style.setProperty("--hover", theme.hover);

  document.querySelector("#theme-label").textContent = "Revolt theme";
}

async function bonfire() {
  socket = new WebSocket("wss://ws.revolt.chat");

  socket.addEventListener("open", async function (event) {
    socket.send(`{"type": "Authenticate","token": "${token}"}`);
  });

  socket.addEventListener("message", async function (event) {
    let data;
    data = JSON.parse(event.data);
    const typingBar = document.getElementById("typingBar");
    switch (data.type) {
      case "Authenticated":
        document.getElementById("status").innerText = "Connected";
        break;
      case "Message":
        if (data.channel === activeChannel) {
          parseMessage(data);
        } else {
          if (channel = document.getElementById(data.channel)) {
            channel.style.color = data.mentions && data.mentions.indexOf(userProfile._id) !== -1 ?
              cssVars.getPropertyValue('--accent') :
              cssVars.getPropertyValue('--foreground');
            channel.style.fontWeight = 'bold';
          }
            document.getElementById(cacheLookup('channels', data.channel)[3]).style.boxShadow =
            data.mentions && data.mentions.indexOf(userProfile._id) !== -1 ?
              cssVars.getPropertyValue('--accent') :
              cssVars.getPropertyValue('--foreground');
        }
        break;
      case 'ChannelAck':
        if (channel = document.getElementById(data.id)) {
            channel.style.colour = cssVars.getPropertyValue('--foreground');
            channel.style.fontWeight = 'normal';
          }
            document.getElementById(cacheLookup('channels', data.id)[3]).style.boxShadow =
            'rgba(0, 0, 0, 0.16) 0px 1px 4px, rgb(51, 51, 51) 0px 0px 0px 3px';
          
        break;
      case "Error":
        document.querySelector(".error-container").style.display = "block";
        document.querySelector(".error-content").textContent = data.error;
        break;
      case "Ready":
        buildServerCache(data.servers);
        buildChannelCache(data.channels);
        buildUserCache(data.users);
        getServers();
        break;
      case "ChannelStartTyping":
        if (data.id !== activeChannel || currentlyTyping.indexOf(data.user) !== -1) break;
        const typingMember = cacheLookup('members', data.user, activeServer);
        const typingUser = cacheLookup('users', data.user);
        const typingUserContainer = document.createElement("div");
        const typingUserName = document.createElement("span");
        const typingUserPfp = document.createElement('img');
        
        typingUserPfp.src = typingMember[2] === undefined ? `https://autumn.revolt.chat/avatars/${typingUser[2]._id}?max_side=25` : `https://autumn.revolt.chat/avatars/${typingMember[2]._id}?max_side=25`;
        typingUserContainer.appendChild(typingUserPfp);
        typingUserName.textContent = typingUser[1];
        typingUserContainer.appendChild(typingUserName);
        typingUserContainer.id = typingUser[0];
        currentlyTyping.push(data.user);
        
        document.getElementById('typingBarContainer').hidden = false;
        typingBar.appendChild(typingUserContainer);
        break;
      case "ChannelStopTyping":
        if (data.id !== activeChannel) break;
        const typingUserContainerz = document.getElementById(data.user);
        if (typingUserContainerz) {
          typingUserContainerz.remove();
          currentlyTyping.splice(currentlyTyping.indexOf(data.user), 1);
        };
        if (typingBar.children.length === 0) document.getElementById('typingBarContainer').hidden = true;
    }
  });

  socket.addEventListener("error", async function (event) {
    document.getElementById("error");
  });
}

async function login() {
  let toggleTheme = document.querySelector("#toggleTheme");
  let toggleToken = document.querySelector("#toggleToken");

  if (document.getElementById("token").value || token) {
    if (!token) token = document.getElementById("token").value;
  } else if (
    document.getElementById("email").value != "" &&
    document.getElementById("password").value != ""
  ) {
    let tokenResponse = await fetch(
      "https://api.revolt.chat/auth/session/login",
      {
        method: "POST",
        body: JSON.stringify({
          email: document.getElementById("email").value,
          password: document.getElementById("password").value,
          friendly_name: "Retaped",
        }),
      }
    )
      .then((res) => res.json())
      .then((data) => data);
    if (tokenResponse.result === "Success") {
      token = tokenResponse.token;
    } else {
      console.log("login failed");
    }
  } else {
    console.log(
      "No login method provided, how the fuck do you expect to log in?"
    );
    return;
  }
  if ((userProfile = await fetchResource("users/@me")) === false) {
    console.log("Login failed");
    return 1;
  }
  if (toggleToken.checked == true) {
    if (!localStorage.getItem("token")) localStorage.setItem("token", token);
  }
  if (toggleTheme.checked == true) {
    loadSyncSettings();
  }
  bonfire();
  // Hide & show
  document.querySelector(".login-screen").style.display = "none";
  document.getElementById("logged").style.display = "grid";
}

async function getServers() {
  let serverContainer = document.getElementById("servers");
  while (serverContainer.hasChildNodes()) {
    serverContainer.removeChild(serverContainer.lastChild);
  }
  unreads.forEach((unread) => {
    if(unread.last_id < cacheLookup('channels',unread._id.channel)[4] && mutedChannels.indexOf(unread._id.channel) === -1){
unreadChannels.push(unread._id.channel);
    }  
  }) 
  for (let i = 0; i < cache.servers.length; i++) {
    let server = document.createElement("button");
    server.onclick = () => {
      activeServer = cache.servers[i][0];
      getChannels(cache.servers[i][0]);
    };
    cache.servers[i][6].forEach((channel) => {
      if(unreadChannels.indexOf(channel) !== -1 && mutedChannels.indexOf(channel) === -1) server.style.boxShadow = `${cssVars.getPropertyValue('--foreground')} 0px 0px 0px 3px`;
    }); 

    server.id = cache.servers[i][0];

    let serverIcon = document.createElement("img");
    serverIcon.className = "server";
    if (cache.servers[i][2] == null) {
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      const context = canvas.getContext("2d");
      const text = cache.servers[i][1].charAt(0);
      context.font = "64px Arial";
      context.fillStyle = "0,0,0";
      context.fillText(text, 8, 48);
      serverIcon.src = canvas.toDataURL();
    } else {
      serverIcon.src = `https://autumn.revolt.chat/icons/${cache.servers[i][2]}?max_side=64`;
    }
    server.appendChild(serverIcon);
    serverContainer.appendChild(server);
  }
}

async function getChannels(id) {
  let channelContainer = document.getElementById("channels");

  while (channelContainer.hasChildNodes()) {
    channelContainer.removeChild(channelContainer.lastChild);
  }
  let addedChannels = [];

  cache.servers[cacheIndexLookup("servers", activeServer)][5].forEach(
    (category) => {
      let categoryContainer = document.createElement("details");
      let categoryText = document.createElement("summary");

      categoryContainer.open = true;
      categoryContainer.classList.add("channel-category");

      categoryText.textContent = category.title;
      categoryText.classList.add("categoryText");
      categoryContainer.appendChild(categoryText);

      for (let j = 0; j < category.channels.length; j++) {
        const currentChannel = cacheLookup("channels", category.channels[j]);
        addedChannels.push(currentChannel[0]);

        if (currentChannel[2] !== "TextChannel") continue;
        if (currentChannel[3] !== id) continue;

        let channel = document.createElement("button");
        channel.classList.add("channel");

        channel.onclick = () => {
          getMessages(currentChannel[0]);
        };

        let channelText = document.createElement("span");
        channel.id = currentChannel[0];
        channelText.innerText = currentChannel[1];
        for (let i = 0; i < unreads.length; i++){
          if (unreads[i]['_id'].channel === currentChannel[0]) { //currentChannel[0] is the ID of the channel currently being returned
            if (mutedChannels.indexOf(currentChannel[0]) === -1 && currentChannel[4] > unreads[i].last_id) channel.style.fontWeight = 'bold';

            break;
          }
        }
        channel.appendChild(channelText);

        if(mutedChannels.indexOf(currentChannel[0]) !== -1) channel.style.color = "#777777"
        categoryContainer.appendChild(channel);
      }
      channelContainer.appendChild(categoryContainer);
    }
  );

  let channels = cache.channels;
  for (let i = 0; i < channels.length; i++) {
    if (channels[i][3] !== id) continue;
    if (channels[i][2] !== "TextChannel") continue;
    if (addedChannels.indexOf(channels[i][0]) !== -1) continue;
    const currentChannel = cacheLookup("channels", channels[i][0]);
        addedChannels.push(currentChannel[0]);
        if (currentChannel[2] !== "TextChannel") continue;
        if (currentChannel[3] !== id) continue;

        let channel = document.createElement("button");
    channel.classList.add("channel");

        channel.onclick = () => {
          getMessages(currentChannel[0]);
        };
        for (let i = 0; i < unreads.length; i++){
          if (unreads[i]['_id'].channel === currentChannel[0]) { //currentChannel[0] is the ID of the channel currently being returned
            if (mutedChannels.indexOf(currentChannel[0]) === -1 && currentChannel[4] > unreads[i].last_id) channel.style.fontWeight = 'bold';

            break;
          }
        }
        
        let channelText = document.createElement("span");
        channelText.id = currentChannel[0];
        channelText.innerText = currentChannel[1];

        channel.appendChild(channelText);
    channelContainer.insertBefore(channel, channelContainer.children[0]);
  }
}

function clearMessages() {
  const messageContainer = document.getElementById("messages");
  while (messageContainer.hasChildNodes()) {
    messageContainer.removeChild(messageContainer.lastChild);
  }
}

//
// * Processing
//

async function buildChannelCache(channels) {
  let categories = {};
  for (let i = 0; i < channels.length; i++) {
    switch (channels[i].channel_type) {
      case "TextChannel":
        cache.channels.push([
          channels[i]._id,
          channels[i].name,
          channels[i].channel_type,
          channels[i].server,
          channels[i].last_message_id,
        ]);
        break;
      case "Group":
        cache.channels.push([
          channels[i]._id,
          channels[i].name,
          channels[i].channel_type,
        ]);
        break;
      case "DirectMessage":
        cache.channels.push([
          channels[i]._id,
          channels[i].recipients,
          channels[i].channel_type,
        ]);
    }
  }

  for (const server in cache.servers) {
    cache.servers[server][5].forEach((category) => {
      let tmpCategory = [];
      category.channels.forEach((channel) => {
        let anthTmpChannel;
        for (tmpChannel in channels) {
          if (channels[tmpChannel]._id === channel) {
            anthTmpChannel = tmpChannel;
            break;
          }
        }
        tmpCategory.push(channels[anthTmpChannel]);
      });

      cache.categories.push({ [category]: tmpCategory });
    });
  }
}

async function buildUserCache(users) {
  for (let i = 0; i < users.length; i++) {
    if (users[i].avatar) {
      cache.users.push([
        users[i]._id,
        users[i].username,
        users[i].avatar,
        users[i].bot,
      ]);
    } else {
      cache.users.push([
        users[i]._id,
        users[i].username,
        undefined,
        users[i].bot,
      ]);
    }
  }
}

async function buildServerCache(servers) {
  for (let i = 0; i < servers.length; i++) {
    cache.servers.push([
      servers[i]["_id"],
      servers[i]["name"],
      servers[i].icon ? servers[i].icon._id : null,
      servers[i].roles,
      [],
      servers[i].categories,
      servers[i].channels,
    ]);
  }
  getServers();
}

function parseMessage(message) {
  
  const member = cacheLookup("members", message.author, activeServer);

  const messageContainer = document.getElementById("messages");
  cache.messages.push([message._id, message.author, message.content]);

  let messageDisplay = document.createElement("div");
  let messageContent = document.createElement("p");
  let userdata = document.createElement("div");
  let username = document.createElement("button");
  let profilepicture = document.createElement("img");
  let replyButton = document.createElement("button");
  let masqueradeBadge = document.createElement("span");

  messageDisplay.classList.add("message-display");
  profilepicture.classList.add("chat-pfp");
  userdata.classList.add("userdata");
  username.classList.add("username");
  replyButton.classList.add("reply-btn");
  messageContent.classList.add("message-content");
  let user;
  if ((user = cacheLookup("users", message.author)) === 1) {
    if (Object.keys(message).indexOf('system') !== -1) {
      if(message.system.id) {
        user = [message.system.id, message.system.id, undefined, undefined];
      } else{
        user = [message.system.by, message.system.by, undefined, undefined];
      }
    } else {
      user = [message.author, message.author, undefined, undefined];
    }
  }
  if (message.system) {
    username.textContent = cacheLookup('users',message.system.id)[0];
    messageContent.textContent = message.system.type;
  } else {
  if (!message.masquerade) {
    username.textContent = member.nickname ? member.nickname : user[1];
    if (user[3] !== undefined) masqueradeBadge.textContent = "Bot";
    username.appendChild(masqueradeBadge);
    profilepicture.src = member.avatar
      ? `https://autumn.revolt.chat/avatars/${member.avatar._id}`
      : user[2]
      ? `https://autumn.revolt.chat/avatars/${user[2]._id}?max_side=256`
      : `https://api.revolt.chat/users/${user[0]._id}/default_avatar`;

    if (member.roles) {
      for (let i = member.roles.length + 1; i >= 0; i--) {
        let tmpColour;
        if ((
          tmpColour = cacheLookup("roles", member.roles[i], activeServer)[
            "colour"
          ])
        ) {
          username.style.color = tmpColour;
          break;
        }
      }
    }
  } else {
    masqueradeBadge.textContent = "Masq";
    username.textContent = message.masquerade.name;
    username.appendChild(masqueradeBadge);

    if (message.masquerade.avatar) {
      profilepicture.src = `https://jan.revolt.chat/proxy?url=${message.masquerade.avatar}`;
    } else {
      profilepicture.src = user[2]
        ? `https://autumn.revolt.chat/avatars/${user[2]._id}?max_side=256`
        : `https://api.revolt.chat/users/${user[0]._id}/default_avatar`;
      username.style.color = message.masquerade.colour;
    }
    }
  }
  username.onclick = () => {
    loadProfile(user[0]);
  };
  profilepicture.onclick = () => {
    loadProfile(user[0]);
  };

  userdata.appendChild(profilepicture);
  userdata.appendChild(username);
  if (message.mentions) {
    let parsedMessage = document.createElement("p");
    parsedMessage.textContent = message.content;

    message.mentions.forEach((mention) => {
      let segConcat = document.createElement("div");
      segConcat.classList.add("mention-container");

      parsedMessage.innerHTML.split(`@${mention}`).forEach((segment) => {
        let ping = document.createElement("span");
        ping.classList.add("mention");
        ping.textContent = cacheLookup("users", mention)[1];
        let segElement = document.createElement("p");
        segElement.innerHTML = segment;
        segConcat.appendChild(segElement);
        segConcat.appendChild(ping);
      });
      parsedMessage = segConcat;
    });
    messageContent.appendChild(parsedMessage);
  } else if (!message.system) messageContent.textContent = message.content;

  if (message.replies) {
    let reply = document.createElement("div");
    reply.classList.add("reply-content");
    for (let j = 0; j < message.replies.length; j++) {
      let replyContent = document.createElement("span");
      replyContent.textContent =
        "> " + cacheLookup("messages", message.replies[j])[2] + "\n";
      reply.appendChild(replyContent);
    }
    messageDisplay.appendChild(reply);
  }

  messageDisplay.appendChild(userdata);
  messageDisplay.appendChild(messageContent);

  messageDisplay.id = message._id;
  messageDisplay.class = "message";

  messageContainer.appendChild(messageDisplay);

  if (message.attachments) {
    let attachments = document.createElement("div");
    attachments.classList.add("message-attachments");
    message.attachments.forEach((tmpAtchmntAttrs) => {
      let tmpAttachment;
      if (tmpAtchmntAttrs.content_type.startsWith("image")) {
        tmpAttachment = document.createElement("img");
        tmpAttachment.src = `https://autumn.revolt.chat/attachments/${tmpAtchmntAttrs._id}/${tmpAtchmntAttrs.filename}`;
      } else if (tmpAtchmntAttrs.content_type.startsWith("video")) {
        tmpAttachment = document.createElement("video");
        tmpAttachment.controls = true;
        tmpAttachment.style.maxWidth = "30%";
        tmpAttachment.style.maxHeight = "30%";
        let subAttachment = document.createElement("source");
        subAttachment.src = `https://autumn.revolt.chat/attachments/${tmpAtchmntAttrs._id}/${tmpAtchmntAttrs.filename}`;
        subAttachment.type = tmpAtchmntAttrs.content_type;
        tmpAttachment.appendChild(subAttachment);
      } else if (tmpAtchmntAttrs.content_type.startsWith("audio")) {
        tmpAttachment = document.createElement("div");

        let tmpContainer = document.createElement("audio");
        tmpContainer.controls = true;
        tmpContainer.textContent = tmpAtchmntAttrs.filename;

        let subAttachment = document.createElement("source");
        subAttachment.src = `https://autumn.revolt.chat/attachments/${tmpAtchmntAttrs._id}/${tmpAtchmntAttrs.filename}`;
        subAttachment.type = tmpAtchmntAttrs.content_type;

        tmpContainer.appendChild(subAttachment);
        let name = document.createElement("span");
        name.textContent = tmpAtchmntAttrs.filename + "\n";

        tmpAttachment.appendChild(name);
        tmpAttachment.appendChild(tmpContainer);
      } else {
        tmpAttachment = document.createElement("a");
        tmpAttachment.textContent = tmpAtchmntAttrs.filename;
        tmpAttachment.href = `https://autumn.revolt.chat/attachments/${tmpAtchmntAttrs._id}/${tmpAtchmntAttrs.filename}`;
      }
      attachments.appendChild(tmpAttachment);
    });
    messageDisplay.appendChild(attachments);
  }

  replyButton.onclick = () => {
    activeReplies.push({
      id: message["_id"],
      mention: false,
    });
    const replyText = document.createElement("p");
    replyText.textContent = message.content;
    document.querySelector(".replying-container").appendChild(replyText);
    replyText.classList.add("replying-content");
  };
  replyButton.innerText = "Reply";
  userdata.appendChild(replyButton);
}

async function getMessages(id) {
  cache.messages = [];

  activeChannel = id;

  fetchResource(`channels/${id}`).then((data) => {
    document.getElementById("chanName").innerText =
      data.channel_type === "DirectMessage" ? data.recipients[0] : data.name;
  });

  const placeholder = await fetchResource(
    `channels/${id}/messages?include_users=true&sort=latest`
  );
  const users = placeholder.users;

  for (let i = 0; i < users.length; i++) {
    if (cacheLookup("users", users[i] === 1))
      cache.users.push([
        users[i]._id,
        users[i].username,
        users[i].avatar,
        users[i].bot,
      ]);
  }
  if (placeholder.members) {
    const members = placeholder.members;
    for (let i = 0; i < members.length; i++) {
      if (cacheLookup("members", members[i]._id.user, activeServer) === 1)
        cache.servers[cacheIndexLookup("servers", activeServer)][4].push(
          members[i]
        );
    }
  }

  clearMessages();

  const messages = placeholder.messages;

  for (let i = messages.length - 1; i >= 1; i--) {
    parseMessage(messages[i]);
  }
  fetch(`https://api.revolt.chat/channels/${activeChannel}/ack/${messages[0]._id}`, {
    headers: {
      'x-session-token': token
    },
    method: "PUT"
  });
  parseMessage(messages[0]);
}

async function loadDMUserName(userID) {
  while (true) {
    if (activeRequests < 10) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  activeRequests++;
  let returnValue = await fetchResource(`users/${userID}`);
  activeRequests--;
  return returnValue;
}

async function loadDMs() {
  let channelContainer = document.getElementById("channels");
  //Clear channel field
  while (channelContainer.hasChildNodes()) {
    channelContainer.removeChild(channelContainer.lastChild);
  }

  for (let i = 0; i < cache.channels.length; i++) {
    //Checking for only DMs
    if (!["DirectMessage", "Group"].includes(cache.channels[i][2])) continue;

    const dmButton = document.createElement("button");
    dmButton.classList.add("channel");

    dmButton.textContent =
      cache.channels[i][2] === "Group"
        ? cache.channels[i][1]
        : cache.channels[i][1][0] === userProfile._id
        ? cache.channels[i][1][1]
        : cacheLookup("users", cache.channels[i][1][0])[1];
    dmButton.onclick = () => {
      getMessages(cache.channels[i][0]);
    };

    dmButton.id = cache.channels[i][0];

    channelContainer.appendChild(dmButton);
  }
}

//
// Profiles
//

async function loadProfile(userID) {
  const userProfile = await fetchResource(`users/${userID}/profile`);
  const memberData = cacheLookup('members', userID, activeServer);
  let username = document.getElementById("username");
  let profilePicture = document.getElementById("profilePicture");
  let profileBackground = document.getElementById("profileMedia");
  let bio = document.getElementById("bio");
  let roleContainer = document.getElementById("roleContainer")

  username.textContent = userProfile.username;
  if (userProfile.avatar) {
    profilePicture.src = `https://autumn.revolt.chat/avatars/${userProfile.avatar._id}`;
  }
  console.log(userProfile)
  if (Object.keys(userProfile).indexOf("background") > -1) {
    profileBackground.style.background = `linear-gradient(0deg, rgba(0,0,0,0.8477591720281863) 4%, rgba(0,0,0,0) 50%),
        url(https://autumn.revolt.chat/backgrounds/${userProfile.background._id}) center center / cover`;
  } else profileBackground.style.background = "";
  bio.textContent = userProfile.content;

  while (roleContainer.hasChildNodes()) {
    roleContainer.removeChild(roleContainer.lastChild);
  }
  if (memberData.roles) for (let i = 0; i < memberData.roles.length; i++) { 
    const role = document.createElement("span");
    const roleData = cacheLookup('roles', memberData.roles[i], activeServer);

    role.textContent = roleData["name"];
    role.style.color = roleData["colour"];
    roleContainer.appendChild(role);
  }
  
  document.getElementById("userProfile").style.display = "flex";
}

//
// Message Sending
//

async function sendMessage() {
  const messageContainer = document.getElementById("input");
  let message = messageContainer.value;
  //Checking for valid pings, and replacing with an actual ping
  if (message.search(/ @[^ ]*/) != -1) {
    let pings = /@[^ ]*/[Symbol.match](message);
    for (let i = 0; i < pings.length; i++) {
      message = message.replace(
        pings[i],
        `<@${cacheLookup("users", pings[i].replace("@", ""))[1]}>`
      );
    }
  }

  await fetch(`https://api.revolt.chat/channels/${activeChannel}/messages`, {
    headers: {
      "x-session-token": token,
    },
    method: "POST",
    body: JSON.stringify({
      content: message,
      replies: activeReplies,
    }),
  }).then(response => response.json()).then(data => fetch(`https://api.revolt.chat/${activeChannel}/ack/${data._id}`));
  messageContainer.value = "";
  activeReplies = [];
  document.querySelector(".replying-container").replaceChildren();
}

//
// UI/UX
//

let toolbar = document.querySelector(".toolbar");
let toolbarBtn = document.querySelector(".toolbar-btn");
toolbarBtn.addEventListener("click", () => {
  toolbar.classList.toggle("show-toolbar");
});

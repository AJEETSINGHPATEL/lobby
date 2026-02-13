import { useEffect, useState } from "react";
import { useSocket } from "../services/SocketProvider";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import peer from "../services/peer";
import ReactPlayer from "react-player";
import {
  Mic,
  MicOff,
  PowerCircle,
  SwitchCamera,
  SwitchCameraIcon,
  MessageSquare,
  X,
  Send,
} from "lucide-react";
function Room() {
  const params = useParams();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const { socket } = useSocket();
  const [myStream, setMyStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const name = searchParams.get("name");
  const id = searchParams.get("accessId");
  const [remoteSocketId, setRemoteSocketId] = useState(null);
  const [facingMode, setFacingMode] = useState("user");
  const [mute, setMute] = useState(false);
  const [remoteName, setRemoteName] = useState("");
  const [newStream, setNewStream] = useState(false);
  const [requestBack, setRequestBack] = useState(false);
  const [showCam, setShowCam] = useState(false);
  const [isCamSwitch, setIsCamSwitch] = useState(false);
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const [isFinishCall, setIsFinishCall] = useState(false);
  const [showButtons, setShowButtons] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    if (isMobile) {
      console.log("You're on a mobile device");
      setShowCam(true);
    } else {
      console.log("You're on a desktop device");
      setShowCam(false);
    }
  }, []);

  async function handleNewUserJoined(data) {
    setShowButtons(true);
    setRemoteSocketId(data?.id);
    setRemoteName(data?.name);
    if (myStream) {
      await peer.peer.addStream(myStream);
      setNewStream(true);
    }
    setRequestBack(false);
  }

  const startCamera = async (facingMode) => {
    setMute(false);

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode },
      audio: true,
    });
    const audioTrack = stream.getAudioTracks()[0];

    const senders = peer.peer.getSenders();
    if (audioTrack) {
      const audioSender = senders.find((s) => s.track?.kind === "audio");
      if (audioSender) {
        await audioSender.replaceTrack(audioTrack);
      }
    }
    const videoTrack = stream.getVideoTracks()[0];

    const sender = senders.find((s) => s.track?.kind === "video");

    if (sender) {
      await sender.replaceTrack(videoTrack);
    } else {
      // If no video sender exists yet, add the track
      peer.peer.addTrack(videoTrack, stream);
    }

    setMyStream(stream);
  };

  const switchCamera = async (accessId) => {
    for (const track of myStream.getTracks()) {
      track.stop();
    }
    setIsCamSwitch(true);
    setMyStream(null);

    const newMode = facingMode === "user" ? "environment" : "user";
    setFacingMode(newMode);

    await startCamera(newMode);
  };

  async function handleCallUser(mode = "user") {
    try {
      setShowButtons(false);
      // myStream?.getTracks()?.forEach((track) => track.stop());
      // setMyStream(null);
      setIsFinishCall(false);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { facingMode: mode },
      });
      if (!myStream) setMyStream(stream);

      if (myStream) {
        const senders = peer.peer.getSenders();
        const videoTrack = stream.getVideoTracks()[0];
        const audioTrack = stream.getAudioTracks()[0];

        const sender = senders.find((s) => s.track?.kind === "video");
        const audioSender = senders.find((s) => s.track?.kind === "audio");

        if (sender) {
          await sender.replaceTrack(videoTrack);
          await audioSender.replaceTrack(audioTrack);
        } else {
          // If no video sender exists yet, add the track
          peer.peer.addTrack(videoTrack, stream);
          peer.peer.addTrack(audioTrack, stream);
        }
      }
      const offer = await peer.getOffer();
      socket.emit("user:call", { to: remoteSocketId, offer, name });
    } catch (error) {
      console.error("Error occured at: ", error?.message);
    }
  }

  async function handleIcommingCall({ from, offer, name }) {
    setRemoteSocketId(from);
    setRemoteName(name);
    setIsFinishCall(false);
    setRequestBack(false);
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });

    setMyStream(stream);

    setShowButtons(true);

    const ans = await peer.getAnswer(offer);
    socket.emit("call:accepted", { ans, to: from });
  }

  function sendStreams() {
    for (const track of myStream.getTracks()) {
      peer.peer.addTrack(track, myStream);
    }
  }

  async function handleAcceptedCall({ ans }) {
    await peer.setRemoteAnswer(ans);
    setShowButtons(true);
    // if (!newStream) {
    sendStreams();
    // }
  }

  async function handleNegoNeededIncomming({ from, offer }) {
    const ans = await peer.getAnswer(offer);
    socket.emit("peer:nego:done", { to: from, ans });
  }
  async function handleNegoNeeded() {
    const offer = await peer.getOffer();
    socket.emit("peer:nego:needed", { offer, to: remoteSocketId });
  }

  useEffect(() => {
    peer.peer.addEventListener("negotiationneeded", handleNegoNeeded);

    return () => {
      peer.peer.removeEventListener("negotiationneeded", handleNegoNeeded);
    };
  }, [handleNegoNeeded]);

  useEffect(() => {
    peer.peer.addEventListener("track", async (ev) => {
      const remoteStreams = ev.streams;
      setShowButtons(true);
      setRemoteStream(remoteStreams[0]);
    });
  }, [myStream]);

  async function handleNegoNeededFinal({ from, ans }) {
    await peer.setRemoteAnswer(ans);

    socket.emit("open:stream", { remoteSocketId });
  }

  async function handleStreamExecution() {
    if (!newStream) sendStreams();
  }

  async function handleUserDiscconnect({ from, name, isCamSwitch, showCam }) {
    remoteStream.getTracks().forEach((track) => track.stop());
    // Clear remoteStream when user disconnects
    setRemoteStream(null);

    setIsFinishCall(true);
  }

  const handleRemoved = ({ from, name }) => {
    if (remoteSocketId === from) {
      myStream?.getTracks()?.forEach((track) => {
        track.stop();
      });
      setMyStream(null);
      remoteStream?.getTracks()?.forEach((track) => {
        track.stop();
      });
      setRemoteStream(null);
      alert(`${name} has left the room`);

      navigate("/");
      window.location.reload();
    }
  };

  useEffect(() => {
    socket.on("user:join", handleNewUserJoined);
    socket.on("incomming:call", handleIcommingCall);
    socket.on("call:accepted", handleAcceptedCall);
    socket.on("peer:nego:needed", handleNegoNeededIncomming);
    socket.on("peer:nego:final", handleNegoNeededFinal);
    socket.on("open:stream", handleStreamExecution);
    socket.on("user:disconnected", handleUserDiscconnect);
    socket.on("removed", handleRemoved);

    return () => {
      socket.off("user:join", handleNewUserJoined);
      socket.off("incomming:call", handleIcommingCall);
      socket.off("call:accepted", handleAcceptedCall);
      socket.off("peer:nego:needed", handleNegoNeededIncomming);
      socket.off("peer:nego:final", handleNegoNeededFinal);
      socket.off("open:stream", handleStreamExecution);
      socket.off("user:disconnected", handleUserDiscconnect);
      socket.off("removed", handleRemoved);
    };
    socket.on("chat:message", handleReceiveMessage);
  }, [
    socket,
    handleNewUserJoined,
    handleIcommingCall,
    handleAcceptedCall,
    handleNegoNeededIncomming,
    handleNegoNeededFinal,
    handleStreamExecution,
    handleUserDiscconnect,
    handleRemoved,
  ]);

  function handleReceiveMessage(data) {
    setMessages((prev) => [...prev, data]);
  }

  function sendMessage() {
    if (newMessage.trim()) {
      socket.emit("chat:message", { room: params?.roomId, message: newMessage, name });
      setNewMessage("");
    }
  }

  function removeStreams() {
    setIsCamSwitch(false);
    if (!myStream) {
      window.location.reload();
    }
    // setRemoteSocketId("");
    myStream.getTracks()?.forEach((track) => {
      track?.stop();
    });

    setMyStream(null);

    remoteStream.getTracks()?.forEach((track) => {
      track.stop();
    });
    setRemoteStream(null);

    setRequestBack(false);
    console.log("close");

    socket.emit("user:disconnected", {
      to: remoteSocketId,
      id,
      name,
      isCamSwitch,
      showCam,
    });
    socket.emit("remove:user", { to: remoteSocketId, id, name });
    // socket.emit("remove:user", { to: remoteSocketId, id });
    window.location.reload();
  }

  async function removeUserFromStream() {
    setIsFinishCall(true);
    setRequestBack(true);

    await remoteStream?.getTracks()?.forEach((track) => {
      track.stop();
    });
    setRemoteStream(null);
    setNewStream(false);
    if (isCamSwitch || showCam) {
      await myStream?.getTracks()?.forEach((track) => {
        track.stop();
      });
      setMyStream(null);
      socket.emit("user:disconnected", {
        to: remoteSocketId,
        id,
        name,
        isCamSwitch,
        showCam,
      });
      socket.emit("remove:user", { to: remoteSocketId, id, name });
    } else if (showCam) {
      socket.emit("remove:user", { to: remoteSocketId, id, name });
    } else {
      socket.emit("user:disconnected", {
        to: remoteSocketId,
        id,
        name,
        showCam,
      });
    }

    // setRemoteName('');
    // setRemoteSocketId("");
  }

  async function handleBeforeUnLoaded(e) {
    // e.preventDefault();

    setRequestBack(false);
    console.log("close");
    setIsCamSwitch(false);
    socket.emit("user:disconnected", {
      to: remoteSocketId,
      id,
      name,
      showCam,
      isCamSwitch,
    });
    await myStream?.getTracks()?.forEach((track) => {
      track.stop();
    });
    setMyStream(null);
    setRemoteSocketId("");
    await remoteStream?.getTracks()?.forEach((track) => {
      track.stop();
    });
    setRemoteStream(null);
    socket.emit("remove:user", { to: remoteSocketId, id, name });
  }

  useEffect(() => {
    window.addEventListener("popstate", removeStreams);

    window.addEventListener("beforeunload", handleBeforeUnLoaded);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnLoaded);
    };
  }, [myStream, remoteStream]);

  const muteAudio = async () => {
    const audioTrack = myStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setMute((prev) => !prev);
    }
  };

  return (
    <div className="  w-full flex max-md:flex-col h-dvh ">
      <div className="  max-md:border-b-[1px] md:border-r-[1px] flex-col items-center gap-y-2 flex py-2 md:w-[400px]">
        <h1 className="text-xl font-semibold mt-2">
          Room No. <b>{params?.roomId}</b>
        </h1>
        <h3 className="text-sm">
          {remoteSocketId ? "" : "The room is empty- No participants yet"}
        </h3>
        {remoteSocketId && !remoteStream && (
          <>
            <p className="">
              <span className="capitalize">{remoteName}'s</span> in a room
            </p>
            {showButtons && (
              <button
                onClick={() => handleCallUser(facingMode)}
                className="border-[1px] px-3 py-2 rounded-md cursor-pointer active:scale-90 transition hover:bg-zinc-100"
              >
                {requestBack ? "Request to join back" : "Accept"}
              </button>
            )}
          </>
        )}
        {remoteSocketId && remoteStream && (
          <h1 className="text-xl">{remoteName} is connected </h1>
        )}
        {myStream && !isFinishCall && showButtons && (
          <>
            <button
              onClick={sendStreams}
              className="border-[1px] p-1 rounded-md cursor-pointer active:scale-90 transition hover:bg-zinc-100"
            >
              Reload Stream
            </button>
            <p className="text-xs bg-red-600  p-1 text-white">
              (Optional : If encountering black screen,try reconnecting first or
              Press Reload Stream; if you are still unable to communicate after
              accepting or joining the other user, please check with the other
              user to ensure the connection is established.)
            </p>
          </>
        )}
      </div>
      <div className="flex flex-col   gap-y-3 w-full h-full items-center">
        {remoteStream && (
          <div className="relative p-2 overflow-hidden flex flex-col h-[45dvh]">
            <h1 className="text-3xl text-center flex justify-between items-center font-semibold">
              <span>Remote Stream({remoteName})</span>
              <button
                title="Disconnect Call"
                onClick={removeUserFromStream}
                className="hover:bg-zinc-200 cursor-pointer rounded-full transition p-1"
              >
                <PowerCircle className="w-5 h-5 text-red-500" />
              </button>
            </h1>

            <ReactPlayer
              style={{
                rotate: facingMode !== "user" && "y 180deg",
                marginInline: "auto",
                width: "100%",
                height: "100%",
              }}
              url={remoteStream}
              // muted={mute}
              width={"100%"}
              height={"100%"}
              playing={remoteStream ? true : false}
            />
          </div>
        )}

        {myStream && (
          <div className="relative p-2 overflow-hidden flex flex-col h-[45dvh]">
            <div className="flex  justify-between items-center ">
              <h1 className="text-3xl font-semibold">{name}</h1>
              <div className="flex items-center gap-x-2">
                {showCam && (
                  <button
                    onClick={switchCamera}
                    title="Switch Camera"
                    className="p-2 hover:bg-zinc-100 h-fit rounded-full cursor-pointer"
                  >
                    <SwitchCamera className="w-5 h-5 text-blue-500" />
                  </button>
                )}
                <button
                  title={mute ? "Unmute" : "Mute"}
                  onClick={muteAudio}
                  className="p-2 hover:bg-zinc-100 h-fit rounded-full cursor-pointer"
                >
                  {mute ? (
                    <MicOff className="w-5 h-5 text-teal-700" />
                  ) : (
                    <Mic className="w-5 h-5 text-teal-700" />
                  )}
                </button>
                <button
                  onClick={() => setShowChat(!showChat)}
                  title="Chat"
                  className="p-2 hover:bg-zinc-100 h-fit rounded-full cursor-pointer"
                >
                  <MessageSquare className="w-5 h-5 text-blue-500" />
                </button>
              </div>
            </div>

            {showChat && (
              <div className="absolute top-0 right-0 h-full w-80 bg-white shadow-lg border-l z-50 flex flex-col">
                <div className="flex justify-between items-center p-3 border-b bg-gray-50">
                  <h3 className="font-semibold">Chat</h3>
                  <button onClick={() => setShowChat(false)} className="p-1 hover:bg-gray-200 rounded-full">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.map((msg, index) => (
                    <div key={index} className={`flex flex-col ${msg.name === name ? 'items-end' : 'items-start'}`}>
                      <span className="text-xs text-gray-500 mb-1">{msg.name}</span>
                      <div className={`px-3 py-2 rounded-lg max-w-[80%] break-words ${msg.name === name
                          ? 'bg-blue-500 text-white rounded-br-none'
                          : 'bg-gray-100 text-gray-800 rounded-bl-none'
                        }`}>
                        {msg.message}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-3 border-t bg-gray-50 flex gap-2">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                    placeholder="Type a message..."
                    className="flex-1 px-3 py-2 border rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!newMessage.trim()}
                    className="p-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            <ReactPlayer
              style={{
                rotate: facingMode === "user" && "y 180deg",
                width: "100%",
                height: "100%",
              }}
              url={myStream}
              width={"100%"}
              height={"100%"}
              muted={mute}
              playing={myStream ? true : false}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default Room;

'use client';
import { useEffect, useRef, useState } from 'react';

export default function Home() {
  const localVidRef  = useRef();
  const remoteVidRef = useRef();
  const pcRef        = useRef();
  const wsRef        = useRef();
  const room         = 'my-room'; // you can make this dynamic
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    // 1️⃣ Connect to signaling server
    wsRef.current = new WebSocket('ws://localhost:8080');
    wsRef.current.onopen = () => {
      wsRef.current.send(JSON.stringify({ type: 'join', room }));
      setJoined(true);
    };
    wsRef.current.onmessage = async ({ data }) => {
      const { type, data: payload } = JSON.parse(data);
      if (type === 'offer') {
        await pcRef.current.setRemoteDescription(payload);
        const ans = await pcRef.current.createAnswer();
        await pcRef.current.setLocalDescription(ans);
        wsRef.current.send(JSON.stringify({ type: 'answer', data: ans }));
      }
      if (type === 'answer') {
        await pcRef.current.setRemoteDescription(payload);
      }
      if (type === 'ice-candidate') {
        await pcRef.current.addIceCandidate(payload).catch(console.error);
      }
    };

    // 2️⃣ Setup RTCPeerConnection
    pcRef.current = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    pcRef.current.onicecandidate = ({ candidate }) => {
      if (candidate) {
        wsRef.current.send(JSON.stringify({ type: 'ice-candidate', data: candidate }));
      }
    };
    pcRef.current.ontrack = ({ streams }) => {
      remoteVidRef.current.srcObject = streams[0];
    };

    // 3️⃣ Get local media
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        localVidRef.current.srcObject = stream;
        stream.getTracks().forEach(track => pcRef.current.addTrack(track, stream));
      });

    return () => {
      wsRef.current.close();
      pcRef.current.close();
    };
  }, []);

  const startCall = async () => {
    const offer = await pcRef.current.createOffer();
    await pcRef.current.setLocalDescription(offer);
    wsRef.current.send(JSON.stringify({ type: 'offer', data: offer }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
      <video ref={localVidRef}  autoPlay muted width={240} />
      <video ref={remoteVidRef} autoPlay       width={240} />
      {joined && <button onClick={startCall}>Start Call</button>}
    </div>
  );
}

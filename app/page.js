'use client';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function Home() {
  const localVidRef  = useRef();
  const remoteVidRef = useRef();
  const pcRef        = useRef();
  const [status, setStatus] = useState('⏳ initializing…');
  const room = 'my-room'; // you can make this dynamic

  // Helper: handle incoming signal payloads
  const handleSignal = async ({ type, data }) => {
    console.log('⬅️ Signal', type, data);
    if (type === 'offer') {
      await pcRef.current.setRemoteDescription(data);
      const answer = await pcRef.current.createAnswer();
      await pcRef.current.setLocalDescription(answer);
      await supabase
        .from('signals')
        .insert({ room, payload: { type: 'answer', data: answer } });
      console.log('➡️ Sent answer');
    }
    if (type === 'answer') {
      await pcRef.current.setRemoteDescription(data);
    }
    if (type === 'ice-candidate') {
      try {
        await pcRef.current.addIceCandidate(data);
      } catch (e) {
        console.error('❌ ICE error', e);
      }
    }
  };

  useEffect(() => {
  // 1️⃣ Subscribe to Supabase Realtime channel
  const channel = supabase
    .channel('public:signals')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'signals',
        filter: `room=eq.${room}`
      },
      ({ new: row }) => handleSignal(row.payload)
    );

  // Subscribe (no .then())
  channel.subscribe();
  console.log('✅ Subscribed to Supabase signals');
  setStatus('🔗 waiting for peers…');

  // 2️⃣ Setup RTCPeerConnection
  pcRef.current = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });
  pcRef.current.onicecandidate = ({ candidate }) => {
    if (candidate) {
      console.log('➡️ Sending ICE', candidate);
      supabase.from('signals').insert({
        room,
        payload: { type: 'ice-candidate', data: candidate }
      });
    }
  };
  pcRef.current.ontrack = ({ streams }) => {
    console.log('🎥 Remote stream received');
    remoteVidRef.current.srcObject = streams[0];
  };

  // 3️⃣ Get local media
  navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then(stream => {
      console.log('🎥 Local stream ready');
      localVidRef.current.srcObject = stream;
      stream.getTracks().forEach(track =>
        pcRef.current.addTrack(track, stream)
      );
      setStatus('📹 ready');
    })
    .catch(err => {
      console.error('❌ getUserMedia error', err);
      setStatus('❌ camera/mic error');
    });

  return () => {
    supabase.removeChannel(channel);
    pcRef.current.close();
  };
}, []);


  // Always-visible button to initiate an offer
  const startCall = async () => {
    setStatus('📞 creating offer…');
    const offer = await pcRef.current.createOffer();
    await pcRef.current.setLocalDescription(offer);
    await supabase.from('signals').insert({
      room,
      payload: { type: 'offer', data: offer }
    });
    console.log('➡️ Sent offer');
    setStatus('📞 offer sent, waiting…');
  };

  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
      <h2>Status: {status}</h2>
      <div style={{ display: 'flex', gap: 20, marginTop: 10 }}>
        <div>
          <h3>Your Camera</h3>
          <video ref={localVidRef}  autoPlay muted width={320} height={240} />
        </div>
        <div>
          <h3>Remote Camera</h3>
          <video ref={remoteVidRef} autoPlay       width={320} height={240} />
        </div>
      </div>
      <button
        style={{ marginTop: 20, padding: '10px 20px', fontSize: 16 }}
        onClick={startCall}
      >
        📞 Start Call
      </button>
    </div>
  );
}

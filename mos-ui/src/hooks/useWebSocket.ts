import { useEffect, useRef, useCallback, useState } from 'react';
import { Client, type IMessage } from '@stomp/stompjs';
import { getCredentials } from '../api/client';

export function useWebSocket(
  accessKey: string | null | undefined,
  onChatMessage: (msg: unknown) => void,
  onOnlineUpdate: (users: unknown) => void,
  onConnected?: () => void,
) {
  const clientRef = useRef<Client | null>(null);
  const [connected, setConnected] = useState(false);

  const onChatMessageRef = useRef(onChatMessage);
  const onOnlineUpdateRef = useRef(onOnlineUpdate);
  const onConnectedRef = useRef(onConnected);

  useEffect(() => { onChatMessageRef.current = onChatMessage; }, [onChatMessage]);
  useEffect(() => { onOnlineUpdateRef.current = onOnlineUpdate; }, [onOnlineUpdate]);
  useEffect(() => { onConnectedRef.current = onConnected; }, [onConnected]);

  const connect = useCallback(() => {
    if (!accessKey) return;
    const creds = getCredentials();

    clientRef.current?.deactivate();

    const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const client = new Client({
      brokerURL: wsProto + '//' + location.host + '/ws',
      connectHeaders: {
        Authorization: 'Basic ' + btoa(creds.accessKey + ':' + creds.secretKey),
      },
      onConnect: () => {
        setConnected(true);
        client.subscribe('/user/queue/chat', (msg: IMessage) => {
          try {
            onChatMessageRef.current(JSON.parse(msg.body));
          } catch {
            // ignore parse errors
          }
        });
        client.subscribe('/topic/online', (msg: IMessage) => {
          try {
            onOnlineUpdateRef.current(JSON.parse(msg.body));
          } catch {
            // ignore parse errors
          }
        });
        onConnectedRef.current?.();
      },
      onDisconnect: () => {
        setConnected(false);
      },
      onWebSocketClose: () => {
        setConnected(false);
      },
      reconnectDelay: 5000,
    });

    client.activate();
    clientRef.current = client;
  }, [accessKey]);

  const disconnect = useCallback(() => {
    clientRef.current?.deactivate();
    clientRef.current = null;
    setConnected(false);
  }, []);

  useEffect(() => {
    return () => {
      clientRef.current?.deactivate();
    };
  }, []);

  const sendChat = useCallback((payload: Record<string, unknown>) => {
    clientRef.current?.publish({
      destination: '/app/chat.send',
      body: JSON.stringify(payload),
    });
  }, []);

  return { connect, disconnect, sendChat, connected };
}

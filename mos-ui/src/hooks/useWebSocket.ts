import { useEffect, useRef, useCallback, useState } from 'react';
import { Client, type IMessage } from '@stomp/stompjs';
import { getCredentials } from '../api/client';

/**
 * WebSocket STOMP hook for chat real-time messaging.
 *
 * Connects to the Spring Boot backend via STOMP over WebSocket.
 * Provides connect/disconnect lifecycle and a sendChat helper.
 *
 * @param accessKey  Current user's access key (null/undefined = no connection)
 * @param onChatMessage  Called when a chat message arrives on /user/queue/chat
 * @param onOnlineUpdate Called when online-user data arrives on /topic/online
 * @param onConnected    Called once after WebSocket connects successfully
 */
export function useWebSocket(
  accessKey: string | null | undefined,
  onChatMessage: (msg: unknown) => void,
  onOnlineUpdate: (users: unknown) => void,
  onConnected?: () => void,
) {
  const clientRef = useRef<Client | null>(null);
  const [connected, setConnected] = useState(false);

  // Refs to avoid stale closures in STOMP callbacks
  const onChatMessageRef = useRef(onChatMessage);
  const onOnlineUpdateRef = useRef(onOnlineUpdate);
  const onConnectedRef = useRef(onConnected);

  useEffect(() => { onChatMessageRef.current = onChatMessage; }, [onChatMessage]);
  useEffect(() => { onOnlineUpdateRef.current = onOnlineUpdate; }, [onOnlineUpdate]);
  useEffect(() => { onConnectedRef.current = onConnected; }, [onConnected]);

  const connect = useCallback(() => {
    if (!accessKey) return;
    const creds = getCredentials();
    if (!creds.endpoint) return;

    // Deactivate any previous client before creating a new one
    clientRef.current?.deactivate();

    const client = new Client({
      brokerURL: creds.endpoint.replace(/^http/, 'ws') + '/ws',
      connectHeaders: {
        Authorization: 'Basic ' + btoa(`${creds.accessKey}:${creds.secretKey}`),
        'X-Minio-Endpoint': creds.endpoint,
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clientRef.current?.deactivate();
    };
  }, []);

  /** Publish a payload to the server via STOMP /app/chat.send */
  const sendChat = useCallback((payload: Record<string, unknown>) => {
    clientRef.current?.publish({
      destination: '/app/chat.send',
      body: JSON.stringify(payload),
    });
  }, []);

  return { connect, disconnect, sendChat, connected };
}

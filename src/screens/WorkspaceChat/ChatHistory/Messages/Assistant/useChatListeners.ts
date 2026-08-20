import { type DynamicChatMessage } from "@/screens/WorkspaceChat/ChatHistory";
import { useState, useEffect } from "react";
import uiStore from "@/store/UIStore";
import { CHAT_HANDLER_EVENTS } from "@/hooks/useChatHandler";

/**
 * This hook is used to listen to the chat updates and teardown the listeners when the chat is complete
 * This is done since to simplify the component tree, we are not using the chat handler context to spam
 * the chat handler context with updates which will lead to maximum call stack issues
 */
export default function useChatListeners(chat: DynamicChatMessage) {
  const [localChat, setLocalChat] = useState<DynamicChatMessage>({ ...chat });
  const [autoClose, setAutoClose] = useState(false);

  useEffect(() => {
    // Each mounted chat message gets its own hook instance, so the listener
    // subscriptions must be per-instance too - removing only this instance's
    // subscription (not removeAllListeners) ensures tearing it down never
    // rips out another chat message's still-active listeners for the same
    // event. NativeEventEmitter has no removeListener(event, fn) - the
    // subscription returned by addListener is the only handle to remove one.
    const updateChatSub = uiStore.emitter.addListener(
      CHAT_HANDLER_EVENTS.UPDATE_CHAT,
      (event: any) => {
        if (event.uuid !== chat.uuid) return;
        setLocalChat({ ...event.chat } as DynamicChatMessage);
      },
    );

    const assistantResponseCompleteSub = uiStore.emitter.addListener(
      CHAT_HANDLER_EVENTS.ASSISTANT_RESPONSE_COMPLETE,
      (event: any) => {
        if (event.uuid !== chat.uuid) return;
        teardownListeners();
      },
    );

    /**
     * Set auto close to true when a new chat is started
     * This listener is not torn down when the chat completes since it is
     * used to close the supplemental UI containers so it needs to persist
     * even after the chat is complete. It self-removes once invoked.
     */
    const newChatStartedSub = uiStore.emitter.addListener(
      CHAT_HANDLER_EVENTS.NEW_CHAT_STARTED,
      (event: any) => {
        if (event.uuid === chat.uuid) return; // Do not close the current chat
        setAutoClose(true);
        newChatStartedSub.remove();
      },
    );

    function teardownListeners() {
      updateChatSub.remove();
      assistantResponseCompleteSub.remove();
    }

    return () => {
      teardownListeners();
      newChatStartedSub.remove();
    };
  }, []);

  return { chat: localChat, autoClose };
}

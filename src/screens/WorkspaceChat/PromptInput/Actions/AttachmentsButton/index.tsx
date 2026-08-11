import { TouchableOpacity } from "react-native";
import { AttachmentInterface } from "@/hooks/useAttachments";
import { Paperclip } from "phosphor-react-native";
import { ChatHandlerInterface } from "@/hooks/useChatHandler/index";
import AttachmentActionMenu from "./AttachmentActionMenu";

export default function AttachmentsButton({
  chatHandler,
  attachmentHandler,
  workspaceSlug,
}: {
  chatHandler: ChatHandlerInterface;
  attachmentHandler: AttachmentInterface;
  workspaceSlug: string;
}) {
  if (chatHandler.isRemote) return null;
  return (
    <AttachmentActionMenu
      attachmentHandler={attachmentHandler}
      workspaceSlug={workspaceSlug}
    />
  );
}

import React from "react";
import {
  View,
  TouchableOpacity,
  NativeEventEmitter,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { DrawerNavigationProp } from "@react-navigation/drawer";
import { List, Microphone } from "phosphor-react-native";
import useDevShortcut from "./useDevShortcut";
import NewThreadIcon from "@/assets/new-thread.svg";
import WorkspaceThread from "@/database/models/WorkspaceThread";
import { PATHS } from "@/utils/paths";
import ModelChip from "./ModelChip";
import LogoIcon from "@/components/LogoIcon";
import uiStore from "@/store/UIStore";
import { useTranslation } from "@/hooks/useTranslation";

export default function TopBar({
  workspace,
  thread,
}: {
  workspace?: any;
  thread?: any;
}) {
  const { t } = useTranslation();
  const navigation = useNavigation<DrawerNavigationProp<any>>();
  const { registerPress, showDebug } = useDevShortcut({ workspace, thread });
  const canMakeThread = !!workspace && !!thread;

  function handleNewThread() {
    const eventEmitter = new NativeEventEmitter();
    WorkspaceThread.create({ workspaceSlug: workspace.slug }).then(thread => {
      eventEmitter.emit("workspaceUpdate", {
        type: "add-thread",
        details: {
          workspaceSlug: workspace.slug,
          thread,
        },
      });
      uiStore.emitter.emit(uiStore.globalEvents.REDIRECT, {
        path: PATHS.workspace_chat,
        params: { wsSlug: workspace.slug, threadSlug: thread.slug },
      });
      navigation.reset({
        index: 0,
        // @ts-ignore
        routes: [
          {
            name: PATHS.workspace_chat,
            params: { wsSlug: workspace.slug, threadSlug: thread.slug },
          },
        ],
      });
    });
  }

  return (
    <View className="flex flex-row items-center justify-between h-fit min-h-[50px] pb-2">
      <TouchableOpacity
        onPress={() => navigation.openDrawer()}
        accessibilityLabel={t("accessibility.openMenu")}>
        <List size={34} color="white" />
      </TouchableOpacity>
      <View className="flex flex-col items-center gap-y-0">
        <TouchableOpacity
          onLongPress={showDebug}
          onPress={registerPress}
          className="flex flex-col items-center gap-y-0">
          <LogoIcon size={40} />
        </TouchableOpacity>
        <ModelChip workspace={workspace} />
      </View>
      {canMakeThread ? (
        <>
          <TouchableOpacity
            onPress={handleNewThread}
            accessibilityLabel={t("accessibility.newThread")}>
            <NewThreadIcon width={32} height={32} fill="white" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate(PATHS.voice_chat)}
            accessibilityLabel={t("accessibility.voiceChat")}
            className="ml-2">
            <Microphone size={32} color="white" weight="bold" />
          </TouchableOpacity>
        </>
      ) : (
        <>
          <View className="w-[32px]" />
          <TouchableOpacity
            onPress={() => navigation.navigate(PATHS.voice_chat)}
            accessibilityLabel={t("accessibility.voiceChat")}>
            <Microphone size={32} color="white" weight="bold" />
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

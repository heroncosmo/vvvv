"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAdminConversationManuallyPaused = isAdminConversationManuallyPaused;
exports.isAdminConversationFollowupManuallyPaused = isAdminConversationFollowupManuallyPaused;
exports.shouldAutoReactivateAdminAgent = shouldAutoReactivateAdminAgent;
exports.shouldAutoRescheduleAdminFollowup = shouldAutoRescheduleAdminFollowup;
function isAdminConversationManuallyPaused(conversation) {
    var _a;
    return ((_a = conversation === null || conversation === void 0 ? void 0 : conversation.contextState) === null || _a === void 0 ? void 0 : _a.manualAgentPause) === true;
}
function isAdminConversationFollowupManuallyPaused(conversation) {
    var _a;
    return ((_a = conversation === null || conversation === void 0 ? void 0 : conversation.contextState) === null || _a === void 0 ? void 0 : _a.manualFollowupPause) === true;
}
function shouldAutoReactivateAdminAgent(params) {
    var _a;
    if (params.isAgentEnabled)
        return false;
    if (!params.globalAgentEnabled)
        return false;
    if (!((_a = params.conversation) === null || _a === void 0 ? void 0 : _a.followupActive))
        return false;
    return !isAdminConversationManuallyPaused(params.conversation);
}
function shouldAutoRescheduleAdminFollowup(params) {
    if (params.allowManualResume)
        return true;
    if (isAdminConversationFollowupManuallyPaused(params.conversation))
        return false;
    if (!params.forceRestart && params.hasScheduledFollowup)
        return false;
    return true;
}

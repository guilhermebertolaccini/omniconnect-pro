import MessageNode from './MessageNode';
import ConditionNode from './ConditionNode';
import ActionNode from './ActionNode';
import DelayNode from './DelayNode';
import StartNode from './StartNode';
import MediaNode from './MediaNode';
import ButtonsNode from './ButtonsNode';
import ListNode from './ListNode';
import AINode from './AINode';

export const nodeTypes = {
  start: StartNode,
  message: MessageNode,
  condition: ConditionNode,
  action: ActionNode,
  delay: DelayNode,
  media: MediaNode,
  buttons: ButtonsNode,
  list: ListNode,
  ai: AINode,
};

export { MessageNode, ConditionNode, ActionNode, DelayNode, StartNode, MediaNode, ButtonsNode, ListNode, AINode };

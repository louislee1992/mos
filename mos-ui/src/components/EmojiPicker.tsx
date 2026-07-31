import { type FC } from 'react';

const EMOJI_LIST = [
  '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😊','😇','🥰','😍','🤩','😘',
  '😗','😚','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐',
  '😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕',
  '🤢','🤮','🤧','🥵','🥶','😵','🤯','🤠','🥳','😎','🤓','🧐','😕','😟','🙁',
  '😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣',
  '😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡',
  '👹','👺','👻','👽','👾','🤖','😺','😸','😹','😻','😼','😽','🙀','😿','😾',
  '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗',
  '💖','💘','💝','💟','👍','👎','👏','🙌','🤝','💪','👋','🤚','✋','🖐️','✌️',
  '🤞','🤟','🤘','👌','🤏','👈','👉','👆','👇','☝️','🖕','🙏','✍️','💅','🤳',
  '🎉','🎊','🎈','🎂','🎀','🎁','🎃','🎄','🌟','⭐','🌈','🔥','💧','💨','❄️',
  '☕','🍵','🍺','🍻','🍷','🍸','🍹','🧋','🥤','🍕','🍔','🍟','🍿','🧁','🍩',
];

interface EmojiPickerProps { onSelect: (emoji: string) => void; onClose: () => void; }

const EmojiPicker: FC<EmojiPickerProps> = ({ onSelect, onClose }) => (
  <div className="emoji-picker-overlay" onClick={onClose}>
    <div className="emoji-picker" onClick={(e) => e.stopPropagation()}>
      <div className="emoji-picker-grid">
        {EMOJI_LIST.map((emoji) => (
          <button key={emoji} className="emoji-picker-item" onClick={() => onSelect(emoji)} title={emoji}>
            {emoji}
          </button>
        ))}
      </div>
    </div>
  </div>
);

export default EmojiPicker;

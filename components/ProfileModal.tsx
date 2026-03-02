
import React, { useState } from 'react';
import { User, X, CheckCircle, DollarSign } from './Icons';
import { UserProfile } from '../types';

interface Props {
  isOpen: boolean;
  users: UserProfile[]; // Receives list of users
  currentName: string;
  currentRate: string;
  onSave: (name: string, rate: string) => void;
  onClose: () => void;
  forceOpen?: boolean;
}

const ProfileModal: React.FC<Props> = ({ isOpen, users, currentName, currentRate, onSave, onClose, forceOpen }) => {
  const [selectedUserId, setSelectedUserId] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) {
      setError('Please select your profile');
      return;
    }
    const user = users.find(u => u.id === selectedUserId);
    if(user) {
        onSave(user.name, user.rate);
        if (!forceOpen) onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl p-6">
        
        <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <div className="bg-orange-100 p-2 rounded-full">
                    <User size={24} className="text-orange-600" />
                </div>
                Who are you?
            </h2>
            {!forceOpen && (
                <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                    <X size={24} />
                </button>
            )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="block text-sm font-semibold text-slate-600 mb-2">Select Profile</label>
                {users.length > 0 ? (
                    <select
                        value={selectedUserId}
                        onChange={(e) => {
                            setSelectedUserId(e.target.value);
                            setError('');
                        }}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 font-bold text-slate-800"
                    >
                        <option value="">-- Select Name --</option>
                        {users.map(user => (
                            <option key={user.id} value={user.id}>{user.name}</option>
                        ))}
                    </select>
                ) : (
                    <div className="p-4 bg-orange-50 text-orange-800 text-sm rounded-xl">
                        No profiles found. Please ask an Administrator to add you.
                    </div>
                )}
            </div>
            
            {selectedUserId && (
                <div className="p-3 bg-emerald-50 text-emerald-700 rounded-xl text-sm flex items-center gap-2">
                     <CheckCircle size={16} />
                     <span>Profile loaded successfully.</span>
                </div>
            )}

            {error && <p className="text-red-500 text-xs mt-1 font-medium">{error}</p>}

            <button
                type="submit"
                disabled={!selectedUserId}
                className="w-full py-3 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition"
            >
                <CheckCircle size={18} />
                Confirm Identity
            </button>
        </form>

      </div>
    </div>
  );
};

export default ProfileModal;

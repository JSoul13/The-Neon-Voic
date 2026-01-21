
import React, { useState } from 'react';
import { Auth } from './components/Auth';
import { Dashboard } from './components/Dashboard';
import { AgentBuilder } from './components/AgentBuilder';
import { LiveInterface } from './components/LiveInterface';
import { StoryInterface } from './components/StoryInterface';
import { PodcastInterface } from './components/PodcastInterface';
import { AgentPersona, User, Project } from './types';

type ViewMode = 'AUTH' | 'DASHBOARD' | 'BUILDER' | 'LIVE' | 'STORY_EDITOR' | 'PODCAST';

function App() {
  const [view, setView] = useState<ViewMode>('AUTH');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  const [activeAgent, setActiveAgent] = useState<AgentPersona | null>(null);
  const [activeProject, setActiveProject] = useState<Project | undefined>(undefined);

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    setView('DASHBOARD');
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setView('AUTH');
    setActiveAgent(null);
    setActiveProject(undefined);
  };

  const handleCreateNew = () => {
    setView('BUILDER');
  };

  const handleEditProject = (project: Project) => {
    setActiveAgent(project.agent);
    setActiveProject(project);
    if (project.isPodcast) {
      setView('PODCAST');
    } else {
      setView('STORY_EDITOR');
    }
  };

  const handleAgentComplete = (agent: AgentPersona, selectedMode: 'LIVE' | 'TTS' | 'PODCAST') => {
    setActiveAgent(agent);
    if (selectedMode === 'TTS') {
        setActiveProject(undefined);
        setView('STORY_EDITOR');
    } else if (selectedMode === 'PODCAST') {
        setActiveProject(undefined);
        setView('PODCAST');
    } else {
        setView('LIVE');
    }
  };

  const handleExitToDashboard = () => {
    setView('DASHBOARD');
    setActiveAgent(null);
    setActiveProject(undefined);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white selection:bg-cyan-500/30 selection:text-cyan-200 font-sans">
      <div className="fixed inset-0 pointer-events-none z-0" 
           style={{ 
             backgroundImage: `linear-gradient(rgba(6, 182, 212, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(6, 182, 212, 0.05) 1px, transparent 1px)`,
             backgroundSize: '50px 50px'
           }}
      ></div>

      <div className="relative z-10">
        {view === 'AUTH' && <Auth onLogin={handleLogin} />}

        {view === 'DASHBOARD' && currentUser && (
            <Dashboard 
               user={currentUser} 
               onCreateNew={handleCreateNew} 
               onEditProject={handleEditProject}
               onLogout={handleLogout}
            />
        )}

        {view === 'BUILDER' && (
            <div className="flex flex-col min-h-screen">
              <div className="flex-1 flex items-center">
                 <div className="absolute top-4 left-4">
                     <button onClick={handleExitToDashboard} className="text-slate-500 hover:text-white flex items-center gap-2 font-mono text-sm">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        BACK TO DASHBOARD
                     </button>
                 </div>
                 <AgentBuilder onComplete={handleAgentComplete} />
              </div>
            </div>
        )}

        {view === 'LIVE' && activeAgent && (
            <LiveInterface agent={activeAgent} onExit={handleExitToDashboard} />
        )}

        {view === 'STORY_EDITOR' && activeAgent && currentUser && (
            <StoryInterface 
              agent={activeAgent} 
              initialProject={activeProject}
              userId={currentUser.id}
              onExit={handleExitToDashboard} 
            />
        )}

        {view === 'PODCAST' && activeAgent && currentUser && (
            <PodcastInterface 
               hostAgent={activeAgent}
               initialProject={activeProject}
               userId={currentUser.id}
               onExit={handleExitToDashboard}
            />
        )}
      </div>
    </div>
  );
}

export default App;

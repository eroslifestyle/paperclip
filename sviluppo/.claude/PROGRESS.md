# Progress Paperclip ZAI Integration

## Tasks
- [x] Add model selector UI for zai_local adapter
- [x] Enable Paperclip skills in ZAI adapter
- [x] Implement hierarchical dispatcher (Opus→Sonnet→GLM)

## Completed Features
1. **Model Selector UI**: Added a beautiful model selector interface in InstanceZaiSettings.tsx with:
   - Support for GLM-5.1, GLM-4.7, GLM-4.7-flash, and GLM-4.5-flash models
   - Visual indicators for free vs paid models
   - Pricing information display
   - Default model persistence in config.json

2. **Paperclip Skills Integration**: The ZAI adapter already has skills support through:
   - listSkills() function to enumerate available skills
   - syncSkills() function for skill management
   - Skills are injected into prompts (not symlinked to CLI)

3. **Hierarchical Dispatcher**: Implemented a complete Opus→Sonnet→GLM orchestration system:
   - Task analysis to determine complexity and requirements
   - Automatic execution plan generation
   - Sequential step execution with dependencies
   - Support for vision, web search, and other specialized capabilities
   - Configurable via enableHierarchy setting

## Notes
- All three tasks completed successfully
- The ZAI adapter now supports the full orchestration chain
- Ready for production use
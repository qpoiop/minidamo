import os

path = '/Users/qpoiop/workspaces/test/minidamo/.claude/skills/agentic/agents'
replacements = [
    ('위젯', '컴포넌트'),
    ('Widget', 'Component'),
    ('widget', 'component'),
    ('Notifier/Provider', 'Hook/Context'),
    ('Provider/Notifier', 'Hook/Context'),
    ('Notifier', 'Hook/Context'),
    ('Notifier 액션으로', 'Hook 함수로'),
    ('Notifier/Service', 'Hook/Service'),
    ('build()', 'render()'),
    ('build 메서드', '컴포넌트 함수'),
    ('app_state.dart', 'usePeer.ts / useLocation.ts'),
    ('lib/', 'src/'),
    ('test/', 'src/tests/'),
]

for root, dirs, files in os.walk(path):
    for file in files:
        if file.endswith('.md'):
            file_path = os.path.join(root, file)
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            new_content = content
            for old_str, new_str in replacements:
                new_content = new_content.replace(old_str, new_str)
            
            if new_content != content:
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                print(f"Updated Agent File: {file_path}")

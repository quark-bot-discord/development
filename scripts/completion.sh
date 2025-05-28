#!/bin/bash

# Get all available services from service definitions
_get_available_services() {
    local services=""
    
    # Get services from TypeScript service definitions (new approach)
    if [[ -d "/workspace/q4" ]]; then
        # Application services from q4/ directory
        services+=" $(find /workspace/q4 -name "*.ts" -not -path "*/const/*" -not -path "*/infra/*" -exec basename {} .ts \;)"
        # Infrastructure services from q4/infra/ directory  
        services+=" $(find /workspace/q4/infra -name "*.ts" -exec basename {} .ts \;)"
    fi
    
    # Remove duplicates and sort
    echo "$services" | tr ' ' '\n' | sort -u | tr '\n' ' '
}

# Get configured local services
_get_local_services() {
    local config_file="/workspace/.quark-dev-config.json"
    if [[ -f "$config_file" ]]; then
        # Add debug output to stderr
        local services=$(jq -r '.localServices | keys[]' "$config_file" 2>/dev/null)
        echo "$services"
    else
        echo "Config file not found at $config_file" >&2
    fi
}

_quark_completions()
{
    local cur=${COMP_WORDS[COMP_CWORD]}
    local prev=${COMP_WORDS[COMP_CWORD-1]}
    local cmd=${COMP_WORDS[1]}

    # Handle top-level commands
    if [[ $COMP_CWORD == 1 ]]; then
        local commands="setup add remove cleanup start list-services update-submodules git"
        COMPREPLY=($(compgen -W "$commands" -- "$cur"))
        return 0
    fi

    # Handle options for all commands
    if [[ "$cur" == -* ]]; then
        local opts="--help"
        COMPREPLY=($(compgen -W "$opts" -- "$cur"))
        return 0
    fi

    # Handle service names for add and remove
    case $cmd in
        add)
            if [[ $prev == "add" ]]; then
                local available_services=$(_get_available_services)
                # Remove services that are already configured
                local configured_services=$(_get_local_services)
                local filtered_services=""
                for service in $available_services; do
                    if ! echo "$configured_services" | grep -q "^$service$"; then
                        filtered_services+=" $service"
                    fi
                done
                COMPREPLY=($(compgen -W "$filtered_services" -- "$cur"))
            fi
            ;;
        remove)
            if [[ $prev == "remove" ]]; then
                # Fetch and filter local services
                local services=$(_get_local_services)
                if [[ -n "$services" ]]; then
                    COMPREPLY=($(compgen -W "$services" -- "$cur"))
                else
                    echo "No local services configured" >&2
                fi
            fi
            ;;
    esac

    return 0
}

complete -F _quark_completions quark

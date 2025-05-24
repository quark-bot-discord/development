#!/bin/bash

# Get all available services from k8s directories
_get_available_services() {
    local services=""
    # Search in app-services
    services+=" $(find /workspace/quark-k8s/app-services -name "*.yaml" -not -name "namespace.yaml" -exec basename {} .yaml \;)"
    # Search in core-services
    services+=" $(find /workspace/quark-k8s/core-services -name "*.yaml" -not -name "namespace.yaml" -exec basename {} .yaml \;)"
    # Search in other-services
    services+=" $(find /workspace/quark-k8s/other-services -name "*.yaml" -not -name "namespace.yaml" -exec basename {} .yaml \;)"
    echo "$services"
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
        local commands="setup add remove start"
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
